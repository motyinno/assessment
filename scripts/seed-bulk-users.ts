/**
 * Generates a large synthetic directory (department tree + users) so S08's
 * "3600 users, /users opens under a second" acceptance criterion can
 * actually be checked locally instead of taken on faith.
 *
 * Everything it creates lives under the fake @loadtest.internal domain and
 * a department hrmId range (900000+) far outside anything a real HRM sync
 * would use, and every write is an upsert/skip-duplicate keyed by that
 * deterministic email or hrmId — safe to re-run, and safe to layer on top
 * of real seed data without colliding with it.
 *
 * NEVER point this at a production database — 3600 fake accounts is a lot
 * of directory noise to clean up by hand.
 *
 * Usage: npm run seed:bulk-users
 *        SEED_BULK_COUNT=500 npm run seed:bulk-users   (fewer rows, for a quick check)
 */
import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const TOTAL_USERS = parseInt(process.env.SEED_BULK_COUNT ?? "3600", 10);
const EMAIL_DOMAIN = "loadtest.internal";
const HRM_ID_BASE = 900_000;
const GRADE_VALUES = ["jun-", "jun", "jun+", "mid-", "mid", "mid+", "sen-", "sen", "sen+"] as const;

const FIRST_NAMES = [
  "Alex", "Maria", "Ivan", "Olga", "Dmitry", "Ekaterina", "Sergey", "Anna",
  "Pavel", "Natalia", "Andrei", "Yulia", "Vlad", "Irina", "Mikhail", "Svetlana",
];
const LAST_NAMES = [
  "Ivanov", "Petrov", "Sidorov", "Kuznetsov", "Volkov", "Sokolov", "Popov",
  "Morozov", "Fedorov", "Vasiliev", "Novikov", "Egorov", "Orlov", "Nikitin",
];

interface DeptSpec {
  hrmId: number;
  name: string;
  parentHrmId: number | null;
}

/** Root → 8 divisions → 4 teams each = 41 departments, three levels deep. */
function buildDepartmentTree(): { specs: DeptSpec[]; teamHrmIds: number[]; divisionHrmIds: number[] } {
  const specs: DeptSpec[] = [];
  let hrmId = HRM_ID_BASE;

  const rootId = hrmId++;
  specs.push({ hrmId: rootId, name: "Innowise (load test)", parentHrmId: null });

  const DIVISIONS = ["Engineering", "Delivery", "Platform", "QA", "Data", "People", "Sales", "Finance"];
  const TEAM_SUFFIXES = ["Alpha", "Bravo", "Charlie", "Delta"];

  const divisionHrmIds: number[] = [];
  const teamHrmIds: number[] = [];

  for (const division of DIVISIONS) {
    const divId = hrmId++;
    divisionHrmIds.push(divId);
    specs.push({ hrmId: divId, name: `${division} Division`, parentHrmId: rootId });

    for (const suffix of TEAM_SUFFIXES) {
      const teamId = hrmId++;
      teamHrmIds.push(teamId);
      specs.push({ hrmId: teamId, name: `${division} Team ${suffix}`, parentHrmId: divId });
    }
  }

  return { specs, teamHrmIds, divisionHrmIds };
}

/**
 * Upserts departments in topological order (root, then divisions, then
 * teams — the order `buildDepartmentTree` already produces them in), so
 * each department's parent already has its `path`/`depth` computed by the
 * time we need it. No separate resolution pass required, unlike the real
 * HRM sync (src/lib/hrm/tree.ts), which can't assume that ordering.
 */
async function upsertDepartments(specs: DeptSpec[]) {
  const idByHrmId = new Map<number, string>();
  const pathByHrmId = new Map<number, string>();
  const depthByHrmId = new Map<number, number>();

  for (const spec of specs) {
    const parentId = spec.parentHrmId != null ? idByHrmId.get(spec.parentHrmId) ?? null : null;

    const dept = await prisma.department.upsert({
      where: { hrmId: spec.hrmId },
      update: { name: spec.name, parentHrmId: spec.parentHrmId, parentId },
      create: {
        hrmId: spec.hrmId,
        name: spec.name,
        parentHrmId: spec.parentHrmId,
        parentId,
        isFilterable: true,
      },
    });

    const parentPath = spec.parentHrmId != null ? pathByHrmId.get(spec.parentHrmId) : undefined;
    const parentDepth = spec.parentHrmId != null ? depthByHrmId.get(spec.parentHrmId) ?? 0 : -1;
    const path = parentPath ? `${parentPath}/${dept.id}` : dept.id;
    const depth = parentDepth + 1;

    await prisma.department.update({ where: { id: dept.id }, data: { path, depth } });

    idByHrmId.set(spec.hrmId, dept.id);
    pathByHrmId.set(spec.hrmId, path);
    depthByHrmId.set(spec.hrmId, depth);
  }

  return idByHrmId;
}

function nameForIndex(i: number): { name: string; email: string } {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
  const email = `bulk-user-${String(i).padStart(5, "0")}@${EMAIL_DOMAIN}`;
  return { name: `${first} ${last} #${i}`, email };
}

async function main() {
  console.log(`Seeding ${TOTAL_USERS} bulk users for load testing...`);

  const { specs, teamHrmIds, divisionHrmIds } = buildDepartmentTree();
  const deptIdByHrmId = await upsertDepartments(specs);
  console.log(`Departments ready: ${specs.length} (${divisionHrmIds.length} divisions, ${teamHrmIds.length} teams).`);

  // A handful of admins the division managers report to.
  const admins = [];
  for (let i = 0; i < 3; i++) {
    const email = `bulk-admin-${i}@${EMAIL_DOMAIN}`;
    const admin = await prisma.user.upsert({
      where: { email },
      update: { role: "ADMIN" as UserRole },
      create: { name: `Bulk Admin ${i}`, email, role: "ADMIN" as UserRole, jobTitle: "Administrator" },
    });
    admins.push(admin);
  }

  // One manager per division, reporting to an admin.
  const divisionManagerIdByHrmId = new Map<number, string>();
  for (const [i, hrmId] of divisionHrmIds.entries()) {
    const email = `bulk-div-manager-${hrmId}@${EMAIL_DOMAIN}`;
    const manager = await prisma.user.upsert({
      where: { email },
      update: { role: "MANAGER" as UserRole, managerId: admins[i % admins.length].id },
      create: {
        name: `Division Manager ${i}`,
        email,
        role: "MANAGER" as UserRole,
        managerId: admins[i % admins.length].id,
        jobTitle: "Division Manager",
      },
    });
    divisionManagerIdByHrmId.set(hrmId, manager.id);
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId: manager.id, departmentId: deptIdByHrmId.get(hrmId)! } },
      update: {},
      create: { userId: manager.id, departmentId: deptIdByHrmId.get(hrmId)! },
    });
  }

  // One manager per team, reporting to their division manager.
  const teamManagerIdByHrmId = new Map<number, string>();
  for (const teamHrmId of teamHrmIds) {
    const teamSpec = specs.find((s) => s.hrmId === teamHrmId)!;
    const divManagerId = divisionManagerIdByHrmId.get(teamSpec.parentHrmId!)!;
    const email = `bulk-team-manager-${teamHrmId}@${EMAIL_DOMAIN}`;
    const manager = await prisma.user.upsert({
      where: { email },
      update: { role: "MANAGER" as UserRole, managerId: divManagerId },
      create: {
        name: `Team Manager ${teamHrmId}`,
        email,
        role: "MANAGER" as UserRole,
        managerId: divManagerId,
        jobTitle: "Team Manager",
      },
    });
    teamManagerIdByHrmId.set(teamHrmId, manager.id);
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId: manager.id, departmentId: deptIdByHrmId.get(teamHrmId)! } },
      update: {},
      create: { userId: manager.id, departmentId: deptIdByHrmId.get(teamHrmId)! },
    });
  }

  const structuralCount = admins.length + divisionHrmIds.length + teamHrmIds.length;
  const regularCount = Math.max(0, TOTAL_USERS - structuralCount);

  // Bulk-insert the rank and file: ~7% ASSESSOR, the rest USER, round-robin
  // across teams so every team (and therefore every division) gets people.
  const rows = [];
  for (let i = 0; i < regularCount; i++) {
    const { name, email } = nameForIndex(i);
    const teamHrmId = teamHrmIds[i % teamHrmIds.length];
    const role: UserRole = i % 14 === 0 ? "ASSESSOR" : "USER";
    rows.push({
      name,
      email,
      role,
      grade: GRADE_VALUES[i % GRADE_VALUES.length],
      jobTitle: role === "ASSESSOR" ? "Senior Engineer" : "Engineer",
      managerId: teamManagerIdByHrmId.get(teamHrmId)!,
      teamHrmId,
    });
  }

  const BATCH_SIZE = 500;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    await prisma.user.createMany({
      data: batch.map(({ teamHrmId, ...u }) => u),
      skipDuplicates: true,
    });
    console.log(`  users ${start + 1}-${Math.min(start + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }

  // Resolve the ids createMany didn't return, then attach department
  // memberships in the same batches.
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const emails = batch.map((r) => r.email);
    const created = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    const idByEmail = new Map(created.map((u) => [u.email, u.id]));

    await prisma.userDepartment.createMany({
      data: batch
        .map((r) => {
          const userId = idByEmail.get(r.email);
          const departmentId = deptIdByHrmId.get(r.teamHrmId);
          if (!userId || !departmentId) return null;
          return { userId, departmentId };
        })
        .filter((x): x is { userId: string; departmentId: string } => x !== null),
      skipDuplicates: true,
    });
  }

  const finalTotal = await prisma.user.count({ where: { email: { endsWith: `@${EMAIL_DOMAIN}` } } });
  console.log(`Done. ${finalTotal} @${EMAIL_DOMAIN} users now in the database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
