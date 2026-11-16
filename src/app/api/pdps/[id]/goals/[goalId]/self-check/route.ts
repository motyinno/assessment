import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { errorJson, parseJsonBody, serverError } from "@/lib/api-helpers";
import { generateSelfCheck } from "@/lib/ai-service";
import { SELF_CHECK_LANGUAGES, parseGeneratedQuestions } from "@/lib/self-check";
import { goalTopicContext, loadOwnGoal, toView } from "@/lib/self-check-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** New attempts one person may start per hour, across all goals. */
const HOURLY_LIMIT = 10;

type Params = { params: { id: string; goalId: string } };

/** The owner's latest attempt at this goal, or null. */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, goal } = await loadOwnGoal(params.id, params.goalId, me.id);
  if (error) return error;

  const check = await prisma.pdpSelfCheck.findFirst({
    where: { goalId: goal.id, userId: me.id },
    orderBy: { createdAt: "desc" },
  });
  if (!check) return NextResponse.json(null);
  const ctx = await goalTopicContext(me.id, goal);
  return NextResponse.json(toView(check, ctx.resolved));
}

const startSchema = z.object({ language: z.enum(SELF_CHECK_LANGUAGES).default("ru") });

/** Start a new attempt: the AI writes fresh questions for the goal. */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, goal } = await loadOwnGoal(params.id, params.goalId, me.id);
  if (error) return error;
  const parsed = await parseJsonBody(req, startSchema);
  if (parsed.error) return parsed.error;

  const recent = await prisma.pdpSelfCheck.count({
    where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= HOURLY_LIMIT) {
    return errorJson("RATE_LIMITED", "That's a lot of checks for one hour — take a break and come back later.", 429);
  }

  const language = parsed.data.language ?? "ru";
  const ctx = await goalTopicContext(me.id, goal);
  try {
    const raw = await generateSelfCheck({
      goalTitle: goal.title,
      items: goal.items,
      skills: ctx.skills,
      targetGradeLabel: ctx.targetGradeLabel,
      language,
    });
    const questions = parseGeneratedQuestions(raw, ctx.skills);
    const check = await prisma.pdpSelfCheck.create({
      data: { goalId: goal.id, userId: me.id, language, questions: questions as object[] },
    });
    return NextResponse.json(toView(check, ctx.resolved), { status: 201 });
  } catch (e) {
    console.error("self-check generation failed", e);
    return serverError("Couldn't prepare the questions. Try again in a minute.");
  }
}
