import { PrismaClient, Prisma, UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

type Role = UserRole;
type Grade =
  | "Trainee"
  | "Intern"
  | "jun-"
  | "jun"
  | "jun+"
  | "mid-"
  | "mid"
  | "mid+"
  | "sen-"
  | "sen"
  | "sen+"
  | null;

type SeedUser = {
  name: string;
  email: string;
  role: Role;
  grade: Grade;
  project: string | null;
  managerName: string | null;
};

interface EmployeeRecord {
  firstNameEn: string;
  lastNameEn: string;
  email: string;
  grade: string;
  managerM1?: {
    firstNameEn?: string;
    lastNameEn?: string;
  };
}

// Map the HR grade strings to the internal grade enum.
// Trainee/Intern are first-class grades (treated as Junior for assessments
// via baseGrade()). Lead is treated as sen+. Only "Other" is null.
const GRADE_MAP: Record<string, Grade> = {
  "Junior-": "jun-",
  "Junior": "jun",
  "Junior+": "jun+",
  "Middle-": "mid-",
  "Middle": "mid",
  "Middle+": "mid+",
  "Senior-": "sen-",
  "Senior": "sen",
  "Senior+": "sen+",
  "Lead": "sen+",
  "Trainee": "Trainee",
  "Intern": "Intern",
  "Other": null,
};

// Explicit role overrides by email for people imported from the HR file.
// Everyone else defaults to USER.
const ROLE_OVERRIDES: Record<string, Role> = {
  "mikhail.shatsila@innowise.com": "ADMIN",
  "ilya.razuvaev@innowise.com": "ASSESSOR",
};

function mapEmployee(e: EmployeeRecord): SeedUser {
  const name = `${e.firstNameEn} ${e.lastNameEn}`.trim();
  const email = e.email.trim().toLowerCase();
  const managerName = e.managerM1?.firstNameEn && e.managerM1?.lastNameEn
    ? `${e.managerM1.firstNameEn} ${e.managerM1.lastNameEn}`.trim()
    : null;
  const grade = e.grade in GRADE_MAP ? GRADE_MAP[e.grade] : null;
  const role: Role = ROLE_OVERRIDES[email] ?? "USER";
  return { name, email, role, grade, project: null, managerName };
}

// Dev-only test accounts (used with the Credentials provider).
// Test Assessor is promoted to MANAGER so the dev junior/middle users
// (whose manager string is "Test Assessor") get a working "My Team" demo.
const devUsers: SeedUser[] = [
  {
    name: "Test Admin",
    email: "admin@test.dev",
    role: "ADMIN",
    grade: "sen",
    project: null,
    managerName: null,
  },
  {
    name: "Test Assessor",
    email: "assessor@test.dev",
    role: "MANAGER",
    grade: "sen",
    project: null,
    managerName: null,
  },
  {
    name: "Test User Junior",
    email: "user-jun@test.dev",
    role: "USER",
    grade: "jun",
    project: "demo",
    managerName: "Test Assessor",
  },
  {
    name: "Test User Middle",
    email: "user-mid@test.dev",
    role: "USER",
    grade: "mid",
    project: "demo",
    managerName: "Test Assessor",
  },
];

function loadEmployees(): SeedUser[] {
  const path = join(__dirname, "data", "employees.json");
  const raw = readFileSync(path, "utf8");
  const records: EmployeeRecord[] = JSON.parse(raw);
  return records.map(mapEmployee);
}

async function main() {
  const employees = loadEmployees();
  const users = [...employees, ...devUsers];

  // Pass 1: upsert every user without resolving managers.
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        grade: u.grade,
        project: u.project,
      },
      create: {
        name: u.name,
        email: u.email,
        role: u.role,
        grade: u.grade,
        project: u.project,
      },
    });
  }

  // Pass 2: resolve manager names to ids. Batched via $transaction so a
  // partial run can't leave the DB with half the manager links applied.
  const all = await prisma.user.findMany({ select: { id: true, name: true } });
  const byName = new Map<string, string>();
  for (const u of all) {
    byName.set(u.name.trim().toLowerCase(), u.id);
  }

  let resolved = 0;
  let unresolved = 0;
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  for (const u of users) {
    if (!u.managerName) continue;
    const managerId = byName.get(u.managerName.trim().toLowerCase()) ?? null;
    if (managerId === null) {
      unresolved++;
      console.warn(
        `Seed: manager "${u.managerName}" for ${u.email} not found among seeded users — leaving null.`
      );
      continue;
    }
    updates.push(
      prisma.user.update({
        where: { email: u.email },
        data: { managerId },
      })
    );
    resolved++;
  }
  if (updates.length > 0) {
    // PrismaPromise[] is compatible with $transaction at runtime; the cast
    // satisfies the strict overload typing.
    await prisma.$transaction(updates as Prisma.PrismaPromise<unknown>[] & []);
  }

  console.log(
    `Seed completed: ${users.length} users upserted (${employees.length} HR + ${devUsers.length} dev). Manager links: ${resolved} resolved, ${unresolved} unmatched.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
