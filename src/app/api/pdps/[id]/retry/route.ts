import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp, runDraftGeneration } from "@/lib/pdp-plan";
import { badRequest, forbidden, notFound } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Re-run a FAILED draft in place with the inputs captured at creation time.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, generationInputs: true, user: { select: { id: true, managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(auth.session.user, pdp.user))) return forbidden();
  if (pdp.status !== "FAILED") return badRequest("Only a failed PDP can be retried");
  if (!pdp.generationInputs) return badRequest("This PDP predates retry support — create a new one instead");

  await prisma.pdp.update({
    where: { id: pdp.id },
    data: { status: "GENERATING", error: null, startedAt: new Date() },
  });
  void runDraftGeneration(pdp.id);
  return NextResponse.json({ ok: true }, { status: 202 });
}
