import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { userInScopeWhere } from "@/lib/admin-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CoverageRow {
  id: string;
  name: string;
  people: number;
  withActivePdp: number;
}

/**
 * GET /api/admin/pdps/stats — PDP numbers for the admin's own division
 * (super-admin: everyone). Same scope rule as the list.
 *
 * - `active`: number of ACTIVE plans.
 * - `employees` / `withActivePdp`: non-archived people in scope, and how many
 *   of them have an ACTIVE plan right now.
 * - `departments`: the same coverage per whole department — the person's
 *   division (`User.divisionId`), NOT its sub-units, so "NodeJS BY & Asia" and
 *   "NodeJS Europe" are one "NodeJS" row. A plain admin gets a single row; a
 *   super-admin one per division. Each person is in exactly one.
 * - `managers`: coverage of each manager's DIRECT reports (`User.managerId`),
 *   for managers with at least one report in scope.
 *
 * Rows come back sorted by headcount; the client paginates them.
 */
export async function GET() {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;
  const inScope = userInScopeWhere(auth.scope);

  const [active, people, activePdpUsers] = await Promise.all([
    prisma.pdp.count({ where: { status: "ACTIVE", user: inScope } }),
    prisma.user.findMany({
      where: { isArchived: false, ...inScope },
      select: {
        id: true,
        managerId: true,
        division: { select: { id: true, name: true } },
      },
    }),
    prisma.pdp.findMany({
      where: { status: "ACTIVE", user: { isArchived: false, ...inScope } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const hasActive = new Set(activePdpUsers.map((p) => p.userId));
  const departments = new Map<string, CoverageRow>();
  const managers = new Map<string, CoverageRow>();
  const bump = (map: Map<string, CoverageRow>, id: string, name: string, active: boolean) => {
    const row = map.get(id) ?? { id, name, people: 0, withActivePdp: 0 };
    row.people += 1;
    if (active) row.withActivePdp += 1;
    map.set(id, row);
  };

  for (const u of people) {
    const active = hasActive.has(u.id);
    if (u.division) bump(departments, u.division.id, u.division.name, active);
    if (u.managerId) bump(managers, u.managerId, "", active);
  }

  const managerUsers = await prisma.user.findMany({
    where: { id: { in: [...managers.keys()] } },
    select: { id: true, name: true },
  });
  for (const m of managerUsers) {
    const row = managers.get(m.id);
    if (row) row.name = m.name;
  }

  const sorted = (map: Map<string, CoverageRow>) =>
    [...map.values()].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));

  return NextResponse.json({
    employees: people.length,
    withActivePdp: hasActive.size,
    active,
    departments: sorted(departments),
    managers: sorted(managers),
  });
}
