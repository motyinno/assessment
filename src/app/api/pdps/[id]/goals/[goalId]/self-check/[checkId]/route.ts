import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { conflict, notFound, parseJsonBody, serverError } from "@/lib/api-helpers";
import { gradeSelfCheckOpen } from "@/lib/ai-service";
import {
  answeredOpen,
  answersSchema,
  gradeChoices,
  orderVerdicts,
  parseOpenVerdicts,
  scoreOf,
  type SelfCheckLanguage,
  type SelfCheckQuestion,
} from "@/lib/self-check";
import { goalTopicContext, loadOwnGoal, toView } from "@/lib/self-check-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Submit the answers: choices are graded here, open answers by the AI. */
export async function POST(req: NextRequest, { params }: { params: { id: string; goalId: string; checkId: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, goal } = await loadOwnGoal(params.id, params.goalId, me.id);
  if (error) return error;

  const check = await prisma.pdpSelfCheck.findUnique({ where: { id: params.checkId } });
  if (!check || check.goalId !== goal.id || check.userId !== me.id) return notFound("Check not found");
  if (check.submittedAt) return conflict("This check is already submitted");

  const parsed = await parseJsonBody(req, answersSchema);
  if (parsed.error) return parsed.error;
  const answers = parsed.data.answers;
  const questions = check.questions as unknown as SelfCheckQuestion[];

  try {
    const { toGrade, blank } = answeredOpen(questions, answers);
    const open = toGrade.length
      ? parseOpenVerdicts(
          await gradeSelfCheckOpen({
            language: check.language as SelfCheckLanguage,
            answers: toGrade.map(({ question, answer }) => ({
              id: question.id,
              text: question.text,
              keyPoints: question.keyPoints,
              answer,
            })),
          }),
          toGrade.map((g) => g.question.id)
        )
      : [];
    const verdicts = orderVerdicts(questions, [...gradeChoices(questions, answers), ...open, ...blank]);
    // Only the transition from unsubmitted counts, so a double submit can't overwrite.
    const { count } = await prisma.pdpSelfCheck.updateMany({
      where: { id: check.id, submittedAt: null },
      data: { answers: answers as object[], verdicts: verdicts as object[], score: scoreOf(verdicts), submittedAt: new Date() },
    });
    if (!count) return conflict("This check is already submitted");
    const saved = await prisma.pdpSelfCheck.findUniqueOrThrow({ where: { id: check.id } });
    const ctx = await goalTopicContext(me.id, goal);
    return NextResponse.json(toView(saved, ctx.resolved));
  } catch (e) {
    console.error("self-check grading failed", e);
    return serverError("Couldn't grade your answers. Try submitting again.");
  }
}
