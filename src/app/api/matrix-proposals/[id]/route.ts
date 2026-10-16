import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { matrixProposalPatchSchema } from "@/lib/schemas";
import { badRequest, conflict, notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";

/** Accept / reject / reopen a proposal, or edit its title and skills before accepting. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const proposal = await prisma.matrixProposal.findUnique({ where: { id: params.id } });
  if (!proposal) return notFound("Proposal not found");
  const g = await requireSourceAdmin(proposal.sourceId);
  if (g.error) return g.error;
  if (proposal.state === "APPLIED" || proposal.state === "SKIPPED") return conflict("This proposal is already published");

  const parsed = await parseJsonBody(req, matrixProposalPatchSchema);
  if (parsed.error) return parsed.error;
  const { state, title, payload } = parsed.data;
  if (title && proposal.kind !== "ADD_SECTION" && proposal.kind !== "ADD_TOPIC") return badRequest("Only new sections and topics have a title");
  if (payload && !["ADD_SECTION", "ADD_TOPIC", "ADD_QUESTIONS"].includes(proposal.kind)) {
    return badRequest("Only additions can be edited");
  }

  const updated = await prisma.matrixProposal.update({
    where: { id: params.id },
    data: {
      ...(state ? { state } : {}),
      ...(title ? { title } : {}),
      ...(payload ? { payload: payload as Prisma.InputJsonValue } : {}),
    },
  });
  return NextResponse.json({ id: updated.id, state: updated.state });
}
