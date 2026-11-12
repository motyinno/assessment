import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { badRequest, notFound } from "@/lib/api-helpers";
import { writeRoadmapProgress } from "@/lib/roadmap";
import { goalTopicContext, loadOwnGoal, toView } from "@/lib/self-check-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The employee accepts the offer of a passed check: tick the roadmap skills
 * its correctly answered questions covered. Never happens on its own.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string; goalId: string; checkId: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, goal } = await loadOwnGoal(params.id, params.goalId, me.id);
  if (error) return error;

  const check = await prisma.pdpSelfCheck.findUnique({ where: { id: params.checkId } });
  if (!check || check.goalId !== goal.id || check.userId !== me.id) return notFound("Check not found");

  const ctx = await goalTopicContext(me.id, goal);
  const toTick = toView(check, ctx.resolved).toTick;
  if (!toTick.length || !ctx.sectionId || !goal.matrixTopicId) return badRequest("Nothing to tick on the roadmap");

  await writeRoadmapProgress(me.id, [
    {
      sectionId: ctx.sectionId,
      topicId: goal.matrixTopicId,
      grade: ctx.band,
      resolvedSkills: [...ctx.resolved, ...toTick],
    },
  ]);
  return NextResponse.json(toView(check, [...ctx.resolved, ...toTick]));
}
