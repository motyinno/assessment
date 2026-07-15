import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessmentAssessor } from "@/lib/auth-helpers";
import { badRequest, notFound } from "@/lib/api-helpers";
import { notifyAdminsReviewSubmitted } from "@/lib/notifications";

/**
 * Assessor "ends" a completed assessment and submits it for admin review.
 * Precondition: status COMPLETED + overall feedback (aiFeedback) written.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    select: {
      status: true,
      aiFeedback: true,
      reviewStatus: true,
      title: true,
      request: { select: { chatSpaceName: true } },
      participants: {
        where: { participantRole: "SUBJECT" },
        select: { user: { select: { name: true } } },
      },
    },
  });
  if (!assessment) return notFound("Assessment not found");

  if (assessment.status !== "COMPLETED") {
    return badRequest("Assessment is not completed");
  }
  if (!assessment.aiFeedback || assessment.aiFeedback.trim().length === 0) {
    return badRequest("Add feedback before ending the assessment");
  }
  if (assessment.reviewStatus !== "NONE") {
    return badRequest("Assessment is already submitted for review");
  }

  const updated = await prisma.assessment.update({
    where: { id: params.id },
    data: { reviewStatus: "PENDING", submittedForReviewAt: new Date() },
  });

  await notifyAdminsReviewSubmitted({
    actingUserId: guard.session.user.id,
    actingUserName: guard.session.user.name ?? "An assessor",
    subjectName: assessment.participants[0]?.user.name ?? assessment.title,
    assessmentId: params.id,
    space: assessment.request?.chatSpaceName ?? null,
  });

  return NextResponse.json(updated);
}
