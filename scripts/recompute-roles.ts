/**
 * Recompute every HRM-managed user's role against the CURRENT rule in
 * src/lib/hrm/roles.ts, and — unlike the sync — lower the ones that no longer
 * qualify.
 *
 * Why this is a separate script and not part of the sync: `computeRoleGrants()`
 * deliberately only ever raises a role, so changing the rule leaves everything
 * granted under the old one in place. That was fine when the rule only ever
 * gained conditions; it is not fine now that the rule changed shape (roles come
 * from the person's own `managerialLevel` alone, no longer from "somebody lists
 * you in their `employee.manager`" nor from heading an org unit). Correcting downward is a
 * deliberate, reviewable, one-off — hence a script with a dry run, not a
 * silent side effect of the nightly job.
 *
 * Safety rules, in order:
 *   - Only users with `hrmEmployeeId` (HRM-managed) are considered at all.
 *   - A role a HUMAN set last (latest RoleAuditLog row is source=MANUAL) is
 *     never touched — a manual grant outranks the automatic rule.
 *   - Nobody is lowered below the role they held BEFORE HRM first raised them
 *     (from the earliest HRM_SYNC audit row) — e.g. an ASSESSOR who was raised
 *     to MANAGER goes back to ASSESSOR, not to USER.
 *   - A super-admin is never lowered. `isSuperAdmin()` is `role === "ADMIN" &&
 *     isSuperAdmin`, so demoting one silently revokes their super-admin powers
 *     (HRM Sync, Departments, org-wide scope) — the exact opposite of what a
 *     hand-granted flag means. The flag itself is never written here.
 *   - Every change is written to RoleAuditLog with hrmField "recompute:<facts>".
 *
 * Usage:
 *   npx tsx scripts/recompute-roles.ts            # dry run — prints the plan
 *   npx tsx scripts/recompute-roles.ts --apply    # writes
 */
import prisma from "@/lib/prisma";
import { entitledRole } from "@/lib/hrm/roles";
import type { Role } from "@/lib/roles";

const ROLE_RANK: Record<Role, number> = { USER: 0, ASSESSOR: 1, MANAGER: 2, ADMIN: 3 };
const APPLY = process.argv.includes("--apply");

interface Change {
  userId: string;
  name: string;
  email: string;
  from: Role;
  to: Role;
  hrmField: string;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { hrmEmployeeId: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      managerialLevel: true,
      isSuperAdmin: true,
    },
  });

  // One pass over the audit log instead of two queries per user.
  const audit = await prisma.roleAuditLog.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    orderBy: { createdAt: "asc" },
    select: { userId: true, source: true, previousRole: true },
  });
  const lastSource = new Map<string, string>();
  const firstHrmPrevious = new Map<string, Role>();
  for (const row of audit) {
    lastSource.set(row.userId, row.source);
    if (row.source === "HRM_SYNC" && !firstHrmPrevious.has(row.userId)) {
      firstHrmPrevious.set(row.userId, row.previousRole as Role);
    }
  }

  const raises: Change[] = [];
  const drops: Change[] = [];
  let manualSkipped = 0;
  let superAdminSkipped = 0;

  for (const user of users) {
    const current = user.role as Role;
    const entitled = entitledRole(user.managerialLevel);

    // Floor: never go below what they were before HRM ever touched them.
    const floorRole = firstHrmPrevious.get(user.id) ?? "USER";
    const entitledRank = entitled ? ROLE_RANK[entitled.role] : 0;
    const target: Role =
      entitledRank >= ROLE_RANK[floorRole] ? (entitled?.role ?? "USER") : floorRole;

    if (target === current) continue;

    if (lastSource.get(user.id) === "MANUAL") {
      manualSkipped++;
      continue;
    }
    if (user.isSuperAdmin && ROLE_RANK[target] < ROLE_RANK[current]) {
      superAdminSkipped++;
      continue;
    }

    const change: Change = {
      userId: user.id,
      name: user.name,
      email: user.email,
      from: current,
      to: target,
      hrmField: `recompute:${entitled?.hrmField ?? "no-managerial-level"}`,
    };
    (ROLE_RANK[target] > ROLE_RANK[current] ? raises : drops).push(change);
  }

  const sample = (list: Change[]) =>
    list
      .slice(0, 8)
      .map((c) => `      ${c.from} -> ${c.to}  ${c.name} <${c.email}>  [${c.hrmField}]`)
      .join("\n");

  console.log(`HRM-managed users: ${users.length}`);
  console.log(`  raises: ${raises.length}`);
  if (raises.length) console.log(sample(raises));
  console.log(`  drops:  ${drops.length}`);
  if (drops.length) console.log(sample(drops));
  console.log(`  skipped (a human set the role last): ${manualSkipped}`);
  console.log(`  skipped (super-admin, never lowered): ${superAdminSkipped}`);

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to commit.");
    return;
  }

  const all = [...raises, ...drops];
  for (const c of all) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: c.userId }, data: { role: c.to } }),
      prisma.roleAuditLog.create({
        data: {
          userId: c.userId,
          previousRole: c.from,
          newRole: c.to,
          source: "HRM_SYNC",
          hrmField: c.hrmField,
        },
      }),
    ]);
  }
  console.log(`\nApplied ${all.length} role changes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
