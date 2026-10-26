import { NextRequest, NextResponse } from "next/server";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { badRequest } from "@/lib/api-helpers";
import { applyAcceptedProposals } from "@/lib/matrix-sync";

export const runtime = "nodejs";

/** Publish the accepted proposals together as a new version of the division's matrix. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  const result = await applyAcceptedProposals(params.id, g.session.user.id);
  if (!result) return badRequest("Accept at least one proposal first");
  return NextResponse.json(result);
}
