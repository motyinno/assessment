import { NextRequest, NextResponse } from "next/server";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { conflict } from "@/lib/api-helpers";
import { listProposals, startProposalGeneration } from "@/lib/matrix-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Matrix proposals drafted from this source (Tech matrix → Market sync). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  return NextResponse.json(await listProposals(params.id));
}

/**
 * Draft (or redraft) proposals in the background. Replaces this source's
 * unapplied proposals; applied ones stay as history.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  if (g.source.status === "PROCESSING" || g.source.status === "FAILED") {
    return conflict("Finish processing the report first — proposals are drafted from its mapped signals");
  }
  if (g.source.proposalsStatus === "GENERATING") return conflict("Proposals are already being drafted");
  await startProposalGeneration(params.id);
  return NextResponse.json({ ok: true }, { status: 202 });
}
