import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { createSignalSourceSchema } from "@/lib/schemas";
import { badRequest, parseJsonBody } from "@/lib/api-helpers";
import { createSource, serializeSourceSummary, sourceInclude } from "@/lib/market-signals";
import type { SignalMappingState } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Market signal sources of one division (admin). A plain admin always gets
 * their own division; a super-admin passes `?departmentId=`.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const division = await resolveEditableDivision(auth.session.user, new URL(req.url).searchParams.get("departmentId"));
  if (division.error) return division.error;

  const rows = await prisma.signalSource.findMany({
    where: { departmentId: division.departmentId },
    include: sourceInclude,
    orderBy: [{ createdAt: "desc" }],
  });
  const grouped = await prisma.signal.groupBy({
    by: ["sourceId", "mappingState"],
    where: { sourceId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const counts = new Map<string, Partial<Record<SignalMappingState, number>>>();
  for (const g of grouped) {
    const c = counts.get(g.sourceId) ?? {};
    c[g.mappingState] = g._count._all;
    counts.set(g.sourceId, c);
  }
  return NextResponse.json(rows.map((r) => serializeSourceSummary(r, counts.get(r.id) ?? {})));
}

/**
 * Add a source: a market-report/v1 JSON (validated now, no AI), or an HTML
 * export / pasted text (extracted by the AI in the background). Either way
 * mapping onto the matrix runs in the background and the source lands
 * IN_REVIEW.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = await parseJsonBody(req, createSignalSourceSchema);
  if (parsed.error) return parsed.error;
  const { format, content, title, departmentId } = parsed.data;

  const division = await resolveEditableDivision(auth.session.user, departmentId);
  if (division.error) return division.error;

  const result = await createSource({
    departmentId: division.departmentId,
    format,
    rawText: content,
    title,
    createdById: auth.session.user.id,
  });
  if (!result.ok) return badRequest(result.error, result.issues);
  return NextResponse.json({ id: result.id }, { status: 202 });
}
