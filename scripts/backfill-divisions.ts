/**
 * One-off backfill of `User.divisionId` from the department memberships that
 * are already in the database.
 *
 * The nightly HRM sync resolves this itself (see `resolveDivisions` in
 * src/lib/hrm/sync.ts), so this only exists to avoid a window where every
 * division-scoped screen reads empty between deploying the column and the
 * next run. Safe to re-run: it recomputes from scratch and only writes rows
 * whose division actually changed.
 *
 *   npx tsx scripts/backfill-divisions.ts
 */
import prisma from "@/lib/prisma";
import { resolveDivisionId, type DepartmentWithPath } from "@/lib/org-structure";

async function main() {
  const departments = await prisma.department.findMany({
    select: { id: true, name: true, typeName: true, path: true },
  });
  const byId = new Map(departments.map((d) => [d.id, d]));

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      divisionId: true,
      departments: { select: { departmentId: true } },
    },
  });

  // Group by target division: one updateMany per division rather than one
  // update per person — the same shape the sync pass uses.
  const byDivision = new Map<string | null, string[]>();
  for (const user of users) {
    const memberships = user.departments
      .map((m) => byId.get(m.departmentId))
      .filter((d): d is DepartmentWithPath => !!d);
    const divisionId = resolveDivisionId(memberships, byId);
    if (divisionId === user.divisionId) continue;
    const bucket = byDivision.get(divisionId) ?? [];
    bucket.push(user.id);
    byDivision.set(divisionId, bucket);
  }

  let changed = 0;
  for (const [divisionId, ids] of byDivision) {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { divisionId } });
    changed += ids.length;
  }

  const divisions = departments.filter((d) => d.typeName === "Division");
  const without = await prisma.user.count({ where: { divisionId: null } });
  console.log(
    `users: ${users.length}, updated: ${changed}, divisions in db: ${divisions.length}, still without a division: ${without}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
