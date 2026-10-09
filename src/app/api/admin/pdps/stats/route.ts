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
 * - `active` / `completed` / `drafts`: plan counts (GENERATING/FAILED left out,
 *   like in the list).
 * - `employees` / `withActivePdp`: non-archived people in scope, and how many
 *   of them have an ACTIVE plan right now.
 * - `departments`: the same coverage per org unit of type "Department". A
 *   person is counted in each Department they belong to (HRM allows several),
 *   so the rows needn't add up to `employees`.
 * - `managers`: coverage of each manager's DIRECT reports (`User.managerId`),
 *   for managers with at least one report in scope.
 *
 * Rows come back sorted by headcount; the client paginates them.
 */
export async function GET() {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;
  const inScope = userInScopeWhere(auth.scope);

  const [byStatus, people, activePdpUsers] = await Promise.all([
    prisma.pdp.groupBy({
      by: ["status"],
      where: { status: { in: ["ACTIVE", "COMPLETED", "DRAFT", "ON_REVIEW"] }, user: inScope },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: { isArchived: false, ...inScope },
      select: {
        id: true,
        managerId: true,
        departments: {
          where: { department: { typeName: "Department" } },
          select: { department: { select: { id: true, name: true } } },
        },
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
    for (const { department } of u.departments) bump(departments, department.id, department.name, active);
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
  const count = (...statuses: string[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);

  return NextResponse.json({
    employees: people.length,
    withActivePdp: hasActive.size,
    active: count("ACTIVE"),
    completed: count("COMPLETED"),
    drafts: count("DRAFT", "ON_REVIEW"),
    departments: sorted(departments),
    managers: sorted(managers),
  });
}
