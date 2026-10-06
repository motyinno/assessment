import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { generatePdpSchema } from "@/lib/schemas";
import { canComposePdp, runDraftGeneration, type PdpGenerationInputs } from "@/lib/pdp-plan";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";

/**
 * Start a PDP draft: the AI writes a first pass in the background, then the
 * plan opens in the builder (status DRAFT) for the manager to arrange and
 * approve. Nothing goes to Google Drive until approval.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const parsed = await parseJsonBody(req, generatePdpSchema);
  if (parsed.error) return parsed.error;
  const { topicIds, customTopics = [], assessmentId = null } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, grade: true, managerId: true },
  });
  if (!user) return notFound("User not found");
  if (!(await canComposePdp(me, user))) {
    return forbidden("Only the employee's direct manager or an admin can create their PDP");
  }
  if (!user.grade) return badRequest("User profile has no grade set");

  if (assessmentId) {
    const ok = await prisma.assessmentParticipant.findFirst({
      where: { assessmentId, userId: user.id, participantRole: "SUBJECT" },
      select: { id: true },
    });
    if (!ok) return badRequest("That assessment isn't this employee's");
  }

  const inputs: PdpGenerationInputs = { topicIds, customTopics, assessmentId };
  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: me.id,
      assessmentId,
      fileName: `PDP - ${user.name} - ${new Date().toISOString().slice(0, 10)}.docx`,
      status: "GENERATING",
      topicsJson: [],
      generationInputs: inputs as unknown as Prisma.InputJsonValue,
    },
  });

  void runDraftGeneration(pdp.id);
  return NextResponse.json({ id: pdp.id }, { status: 202 });
}
