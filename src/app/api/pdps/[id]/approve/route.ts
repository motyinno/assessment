import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp, PdpDocError, publishPdpDoc } from "@/lib/pdp-plan";
import { badRequest, errorJson, forbidden, log, notFound } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Approve a draft (DRAFT → ACTIVE): build the Google Doc from the plan and
 * share it with the employee. On an ACTIVE plan this just rebuilds
 * the doc from the current plan ("Update document").
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      driveLink: true,
      user: { select: { id: true, managerId: true } },
      _count: { select: { goals: true } },
    },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(me, pdp.user))) return forbidden();
  if (pdp.status !== "DRAFT" && pdp.status !== "ACTIVE") {
    return badRequest("Only a draft or an active PDP can be approved");
  }
  const firstApproval = pdp.status === "DRAFT";

  try {
    // Drafts from before the builder have their content only in the Google
    // Doc — approve those as they are.
    if (pdp._count.goals === 0) {
      if (!pdp.driveLink) return badRequest("The plan is empty — add at least one topic");
    } else {
      await publishPdpDoc(pdp.id, { id: me.id, name: me.name ?? "" });
    }
  } catch (e) {
    if (e instanceof PdpDocError) return errorJson("DOC_FAILED", e.message, 502);
    log.error("PDP approve failed", { pdpId: pdp.id, error: e instanceof Error ? e.message : String(e) });
    return errorJson("DOC_FAILED", "Couldn't create the Google Doc. Try again.", 502);
  }

  const updated = await prisma.pdp.update({
    where: { id: pdp.id },
    data: firstApproval
      ? { status: "ACTIVE", approvedById: me.id, approvedAt: new Date(), reviewNotes: null }
      : {},
    select: { id: true, status: true, driveLink: true, docSyncedAt: true, approvedAt: true },
  });
  return NextResponse.json(updated);
}
