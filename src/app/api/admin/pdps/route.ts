import { NextRequest, NextResponse } from "next/server";
import type { Prisma, PdpStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { userInScopeWhere } from "@/lib/admin-scope";
import { planProgress, progressPercent } from "@/lib/pdp-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GENERATING/FAILED are transient generation states, not plans an admin
// reviews, so they're never listed — not even under ALL.
const STATUSES: PdpStatus[] = ["ON_REVIEW", "DRAFT", "ACTIVE", "COMPLETED"];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/admin/pdps — every PDP of the admin's own division, paginated.
 *
 * ?status=ACTIVE|COMPLETED|DRAFT|ALL  (default ACTIVE — what's running now)
 * ?userId=<id>                          one employee's plans
 * ?q=<text>                             matches the PDP name or its goal titles
 * ?page=1&pageSize=20
 *
 * Division scope is applied before anything else, so a filter can never widen
 * what an admin sees (`userId` of someone outside the scope just returns
 * nothing).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status") ?? "ACTIVE";
  const userId = sp.get("userId");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const where: Prisma.PdpWhereInput = {
    user: { ...userInScopeWhere(auth.scope) },
  };
  where.status = (STATUSES as string[]).includes(statusParam)
    ? (statusParam as PdpStatus)
    : { in: STATUSES };
  if (userId) where.userId = userId;
  if (q) {
    where.OR = [
      { fileName: { contains: q, mode: "insensitive" } },
      { goals: { some: { title: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.pdp.count({ where }),
    prisma.pdp.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        completedAt: true,
        user: { select: { id: true, name: true, email: true, isArchived: true, manager: { select: { name: true } } } },
        goals: { select: { items: { select: { doneAt: true } } } },
      },
    }),
  ]);

  const items = rows.map(({ goals, ...p }) => ({
    ...p,
    progress: goals.length > 0 ? progressPercent(planProgress(goals)) : null,
  }));

  return NextResponse.json({ items, total, page, pageSize });
}
