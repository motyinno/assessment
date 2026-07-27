import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { gradeLabel } from "@/lib/grades";
import { getValidAccessToken } from "@/lib/google-auth";
import {
  resolveSelectedTopics,
  runPdpGeneration,
  type PdpGenerationInputs,
} from "@/lib/pdp-generation";
import { badRequest, notFound } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-run a FAILED pdp in place using the inputs captured at creation time, so the
// mentor doesn't have to re-select topics. Reuses the same row (no duplicates).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const pdp = await prisma.pdp.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      fileName: true,
      generationInputs: true,
    },
  });
  if (!pdp) return notFound("PDP not found");

  // Caller must be ADMIN, the subject user, or the subject's manager.
  const guard = await requireUserAccess(pdp.userId);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  if (pdp.status !== "FAILED") {
    return badRequest("Only failed PDPs can be retried");
  }

  const inputs = pdp.generationInputs as PdpGenerationInputs | null;
  if (!inputs || !Array.isArray(inputs.topicIds)) {
    return badRequest(
      "This PDP predates one-click retry — re-generate it from the Generate PDP page"
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: pdp.userId },
    include: { manager: { select: { name: true } } },
  });
  if (!user) return notFound("User not found");
  if (!user.grade) return badRequest("User profile has no grade set");

  const driveToken = await getValidAccessToken(me.id);
  if (!driveToken) {
    return badRequest("Connect Google Drive in your profile — PDPs need somewhere to be saved");
  }

  const selected = await resolveSelectedTopics(
    { topicIds: inputs.topicIds, customTopics: inputs.customTopics ?? [] },
    user.grade
  );
  if (selected.length === 0) {
    return badRequest("None of the original topics match the current matrix");
  }

  // Reset the same row back to GENERATING; the user page already polls this.
  const updated = await prisma.pdp.update({
    where: { id: pdp.id },
    data: { status: "GENERATING", error: null, startedAt: new Date() },
  });

  void runPdpGeneration({
    pdpId: pdp.id,
    assessorId: me.id,
    userName: user.name,
    userManager: user.manager?.name ?? "",
    userGradeLabel: gradeLabel(user.grade),
    selected,
    fileName: pdp.fileName,
  });

  return NextResponse.json(updated, { status: 202 });
}
