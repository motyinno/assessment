import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { userInScopeWhere } from "@/lib/admin-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pdps/stats — PDP headline numbers for the admin's own
 * division (super-admin: everyone). Same scope rule as the list.
 *
 * `employees` and `withActivePdp` count non-archived people only (who is here
 * now); plan counts include every PDP of someone in scope. GENERATING/FAILED
 * are left out, like in the list. `avgProgress` covers active plans that are
 * tracked in the app — link-attached ones have no items to measure.
 */
export async function GET() {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;
  const inScope = userInScopeWhere(auth.scope);

  const [employees, byStatus, activeUsers, items, doneItems] = await Promise.all([
    prisma.user.count({ where: { isArchived: false, ...inScope } }),
    prisma.pdp.groupBy({
      by: ["status"],
      where: { status: { in: ["ACTIVE", "COMPLETED", "DRAFT", "ON_REVIEW"] }, user: inScope },
      _count: { _all: true },
    }),
    prisma.pdp.findMany({
      where: { status: "ACTIVE", user: { isArchived: false, ...inScope } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.pdpItem.count({ where: { goal: { pdp: { status: "ACTIVE", user: inScope } } } }),
    prisma.pdpItem.count({ where: { doneAt: { not: null }, goal: { pdp: { status: "ACTIVE", user: inScope } } } }),
  ]);

  const count = (...statuses: string[]) =>
    byStatus.filter((s) => statuses.includes(s.status)).reduce((n, s) => n + s._count._all, 0);

  return NextResponse.json({
    employees,
    withActivePdp: activeUsers.length,
    active: count("ACTIVE"),
    completed: count("COMPLETED"),
    drafts: count("DRAFT", "ON_REVIEW"),
    avgProgress: items > 0 ? Math.round((doneItems / items) * 100) : null,
  });
}
