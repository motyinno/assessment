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
        include: {
          user: {
            select: {
              id: true,
              grade: true,
              _count: { select: { certificates: { where: { pinned: true } } } },
            },
          },
        },
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

  // A grade upgrade requires proof of certification pinned to the subject's
  // profile. Without a pinned certificate the promotion is blocked until the
  // subject pins one.
  if (upgrading && subject._count.certificates === 0) {
    return badRequest(
      "Cannot upgrade grade: the subject has no certificate pinned to their profile. Ask them to pin a certificate before promoting."
    );
  }
  const previousGrade = subject.grade ?? null;
  const resolvedNewGrade = upgrading ? newGrade! : null;
  const notes = (reviewNotes ?? "").trim();

  // A promotion is audited (source: ASSESSMENT) in the same transaction as the
  // User.grade write, so the growth timeline can never disagree with the grade
  // it describes — see GradeAuditLog / lib/grade-history.ts.
  const gradeChanged = upgrading && previousGrade !== resolvedNewGrade;

  await prisma.$transaction([
    ...(upgrading
      ? [
          prisma.user.update({
            where: { id: subject.id },
            data: { grade: resolvedNewGrade },
          }),
        ]
      : []),
    ...(gradeChanged
      ? [
          prisma.gradeAuditLog.create({
            data: {
              userId: subject.id,
              previousGrade,
              newGrade: resolvedNewGrade,
              source: "ASSESSMENT",
              assessmentId: params.id,
              actorId: me.id,
              note: notes.length > 0 ? notes : null,
            },
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
