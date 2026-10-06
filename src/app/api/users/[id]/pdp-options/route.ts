import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp, PDP_GAP_THRESHOLD } from "@/lib/pdp-plan";
import { loadTechMatrix } from "@/lib/data-loader";
import { resolveUserDivision } from "@/lib/user-division";
import { baseGrade, gradeLabel } from "@/lib/grades";
import { forbidden, notFound } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * Topic picker data for drafting a PDP: the subject's division matrix with the
 * skills for their grade, plus the scores from the assessment the plan is based
 * on (`?assessmentId=`, or their latest completed one). Weak topics come
 * preselected.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const subject = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, email: true, grade: true, managerId: true },
  });
  if (!subject) return notFound("User not found");
  if (!(await canComposePdp(me, subject))) {
    return forbidden("Only the employee's direct manager or an admin can create their PDP");
  }

  const requestedId = new URL(req.url).searchParams.get("assessmentId");
  const assessment = await prisma.assessment.findFirst({
    where: {
      ...(requestedId ? { id: requestedId } : { status: "COMPLETED", assessmentType: "GENERAL" }),
      participants: { some: { userId: subject.id, participantRole: "SUBJECT" } },
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, title: true, completedAt: true, results: { select: { category: true, score: true } } },
  });
  if (requestedId && !assessment) return notFound("Assessment not found for this employee");

  const division = await resolveUserDivision(subject.id);
  const matrix = division ? await loadTechMatrix(division.id) : { sections: [] };
  const band = subject.grade ? baseGrade(subject.grade) : null;
  const scoreByKey = new Map(
    (assessment?.results ?? []).filter((r) => r.score !== null).map((r) => [r.category.toLowerCase(), r.score as number])
  );

  const sections = band
    ? matrix.sections
        .map((s) => ({
          id: s.id,
          title: s.title,
          topics: s.topics
            .filter((t) => t[band].length > 0)
            .map((t) => ({
              id: t.id,
              title: t.title,
              skills: t[band],
              score: scoreByKey.get(t.id.toLowerCase()) ?? scoreByKey.get(t.title.toLowerCase()) ?? null,
            })),
        }))
        .filter((s) => s.topics.length > 0)
    : [];

  return NextResponse.json({
    subject: { id: subject.id, name: subject.name, email: subject.email, grade: subject.grade, gradeLabel: gradeLabel(subject.grade) },
    assessment: assessment ? { id: assessment.id, title: assessment.title, completedAt: assessment.completedAt } : null,
    sections,
    preselected: sections
      .flatMap((s) => s.topics)
      .filter((t) => t.score !== null && t.score < PDP_GAP_THRESHOLD)
      .map((t) => t.id),
  });
}
