import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { signalMappingSchema } from "@/lib/schemas";
import { badRequest, conflict, notFound, parseJsonBody } from "@/lib/api-helpers";
import { loadTechMatrix } from "@/lib/data-loader";
import { matrixCandidates } from "@/lib/market-signals";

export const runtime = "nodejs";

/**
 * Confirm or change where a signal lands: a matrix topic, a proposal for a
 * new topic, or out of scope. An admin's choice is never overwritten by a
 * re-run of the mapping.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const signal = await prisma.signal.findUnique({ where: { id: params.id }, select: { sourceId: true } });
  if (!signal) return notFound("Signal not found");
  const g = await requireSourceAdmin(signal.sourceId);
  if (g.error) return g.error;
  if (g.source.status === "PUBLISHED") return conflict("Published sources are frozen — upload a new one instead");
  if (g.source.status === "PROCESSING") return conflict("Wait for processing to finish");

  const parsed = await parseJsonBody(req, signalMappingSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.state === "MAPPED") {
    const topics = matrixCandidates(await loadTechMatrix(g.source.departmentId));
    if (!topics.some((t) => t.id === body.topicId)) return badRequest("That topic isn't in this division's matrix");
  }

  const updated = await prisma.signal.update({
    where: { id: params.id },
    data: {
      mappingState: body.state,
      topicId: body.state === "MAPPED" ? body.topicId : null,
      match: body.state === "MAPPED" ? body.match : null,
      proposedTitle: body.state === "PROPOSAL" ? body.proposedTitle : null,
      mappedBy: "admin",
      rationale: null,
    },
  });
  return NextResponse.json({ id: updated.id, mappingState: updated.mappingState });
}
