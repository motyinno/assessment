import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assessmentReviewDecisionSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

/**
 * Admin decision on an ended assessment. Upgrading writes the chosen grade to
 * the subject's User.grade; either way the assessment is marked REVIEWED.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const parsed = await parseJsonBody(req, assessmentReviewDecisionSchema);
  if (parsed.error) return parsed.error;
  const { action, newGrade, reviewNotes } = parsed.data;

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    include: {
      participants: {
        where: { participantRole: "SUBJECT" },
        include: { user: { select: { id: true, grade: true } } },
      },
    },
  });
  if (!assessment) return notFound("Assessment not found");
  if (assessment.reviewStatus !== "PENDING") {
    return badRequest("Assessment is not pending review");
  }

  const subject = assessment.participants[0]?.user;
  if (!subject) return badRequest("Assessment has no subject");

  const upgrading = action === "upgrade";
  const previousGrade = subject.grade ?? null;
  const resolvedNewGrade = upgrading ? newGrade! : null;
  const notes = (reviewNotes ?? "").trim();

  await prisma.$transaction([
    ...(upgrading
      ? [
          prisma.user.update({
            where: { id: subject.id },
            data: { grade: resolvedNewGrade },
          }),
        ]
      : []),
    prisma.assessment.update({
      where: { id: params.id },
      data: {
        reviewStatus: "REVIEWED",
        reviewedAt: new Date(),
        reviewedById: me.id,
        reviewNotes: notes.length > 0 ? notes : null,
        gradeUpgraded: upgrading,
        previousGrade,
        newGrade: resolvedNewGrade,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
