import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Market sync tab: the division's reports that can drive matrix proposals
 * (mapped — in review, published or archived), with pending counts, and the
 * latest matrix versions.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const division = await resolveEditableDivision(auth.session.user, new URL(req.url).searchParams.get("departmentId"));
  if (division.error) return division.error;

  const [sources, versions] = await Promise.all([
    prisma.signalSource.findMany({
      where: { departmentId: division.departmentId, status: { in: ["IN_REVIEW", "PUBLISHED", "ARCHIVED"] } },
      orderBy: [{ createdAt: "desc" }],
      take: 12,
      select: {
        id: true,
        title: true,
        status: true,
        proposalsStatus: true,
        _count: { select: { proposals: { where: { state: { in: ["PENDING", "ACCEPTED"] } } } } },
      },
    }),
    prisma.techMatrixVersion.findMany({
      where: { departmentId: division.departmentId },
      orderBy: { number: "desc" },
      take: 5,
      select: { id: true, number: true, summary: true, createdAt: true, source: { select: { title: true } }, createdBy: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    sources: sources.map(({ _count, ...s }) => ({ ...s, openProposals: _count.proposals })),
    versions,
  });
}
