import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { gradeLabel } from "@/lib/grades";
import { getValidAccessToken } from "@/lib/google-auth";
import { generatePdpSchema } from "@/lib/schemas";
import { resolveSelectedTopics, runPdpGeneration } from "@/lib/pdp-generation";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  // Caller must be ADMIN, the user themselves, or the user's manager.
  const guard = await requireUserAccess(targetUserId);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, generatePdpSchema);
  if (parsed.error) return parsed.error;
  const { topicIds, customTopics = [] } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { manager: { select: { name: true } } },
  });
  if (!user) return notFound("User not found");
  if (!user.grade) return badRequest("User profile has no grade set");

  const driveToken = await getValidAccessToken(me.id);
  if (!driveToken) {
    return badRequest("Connect Google Drive in your profile — PDPs need somewhere to be saved");
  }

  const selected = await resolveSelectedTopics({ topicIds, customTopics }, user.grade);
  if (selected.length === 0) {
    return badRequest("None of the selected topics match the grade");
  }

  const fileName = `PDP - ${user.name} - ${new Date().toISOString().slice(0, 10)}.docx`;
  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: me.id,
      fileName,
      status: "GENERATING",
      topicsJson: [],
      // Persist the inputs so a FAILED plan can be retried in place.
      generationInputs: { topicIds, customTopics },
    },
  });

  void runPdpGeneration({
    pdpId: pdp.id,
    assessorId: me.id,
    userName: user.name,
    userManager: user.manager?.name ?? "",
    userGradeLabel: gradeLabel(user.grade),
    selected,
    fileName,
  });

  return NextResponse.json(pdp, { status: 202 });
}
