import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

type Role = "USER" | "ASSESSOR" | "ADMIN";
type Grade = "jun-" | "jun" | "jun+" | "mid-" | "mid" | "mid+" | "sen-" | "sen" | "sen+" | null;

type SeedUser = {
  name: string;
  email: string;
  role: Role;
  grade: Grade;
  project: string | null;
  manager: string | null;
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
// Trainee/Intern/Other are modeled as "no assigned grade" (null).
// Lead is treated as sen+.
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
  "Trainee": null,
  "Intern": null,
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
  const manager = e.managerM1?.firstNameEn && e.managerM1?.lastNameEn
    ? `${e.managerM1.firstNameEn} ${e.managerM1.lastNameEn}`.trim()
    : null;
  const grade = e.grade in GRADE_MAP ? GRADE_MAP[e.grade] : null;
  const role: Role = ROLE_OVERRIDES[email] ?? "USER";
  return { name, email, role, grade, project: null, manager };
}

// Dev-only test accounts (used with the Credentials provider).
const devUsers: SeedUser[] = [
  {
    name: "Test Admin",
    email: "admin@test.dev",
    role: "ADMIN",
    grade: "sen",
    project: null,
    manager: null,
  },
  {
    name: "Test Assessor",
    email: "assessor@test.dev",
    role: "ASSESSOR",
    grade: "sen",
    project: null,
    manager: null,
  },
  {
    name: "Test User Junior",
    email: "user-jun@test.dev",
    role: "USER",
    grade: "jun",
    project: "demo",
    manager: "Test Assessor",
  },
  {
    name: "Test User Middle",
    email: "user-mid@test.dev",
    role: "USER",
    grade: "mid",
    project: "demo",
    manager: "Test Assessor",
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

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        grade: u.grade,
        project: u.project,
        manager: u.manager,
      },
      create: u,
    });
  }
  console.log(
    `Seed completed: ${users.length} users upserted (${employees.length} from HR file + ${devUsers.length} dev).`
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
