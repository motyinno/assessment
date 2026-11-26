import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { conflict, notFound, parseJsonBody, serverError } from "@/lib/api-helpers";
import { SELF_CHECK_PASS, answersSchema, scoreOf, type SelfCheckLanguage, type SelfCheckQuestion } from "@/lib/self-check";
import { gradeAttempt, toView } from "@/lib/self-check-server";
import { loadOwnMission, missionResolved } from "@/lib/mission-server";
import { writeRoadmapProgress } from "@/lib/roadmap";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Submit the answers. A passed check completes the mission and ticks the
 * skills it proved on the roadmap right away — the mission was the person's
 * own choice, so there's no separate offer to accept.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; checkId: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, mission } = await loadOwnMission(params.id, me.id);
  if (error) return error;

  const check = await prisma.techMissionCheck.findUnique({ where: { id: params.checkId } });
  if (!check || check.missionId !== mission.id) return notFound("Check not found");
  if (check.submittedAt) return conflict("This check is already submitted");

  const parsed = await parseJsonBody(req, answersSchema);
  if (parsed.error) return parsed.error;
  const answers = parsed.data.answers;
  const questions = check.questions as unknown as SelfCheckQuestion[];

  try {
    const verdicts = await gradeAttempt(questions, answers, check.language as SelfCheckLanguage);
    const score = scoreOf(verdicts);
    const now = new Date();
    // Only the transition from unsubmitted counts, so a double submit can't overwrite.
    const { count } = await prisma.techMissionCheck.updateMany({
      where: { id: check.id, submittedAt: null },
      data: { answers: answers as object[], verdicts: verdicts as object[], score, submittedAt: now },
    });
    if (!count) return conflict("This check is already submitted");
    if (score >= SELF_CHECK_PASS) {
      await prisma.techMission.updateMany({
        where: { id: mission.id, status: "ACTIVE" },
        data: { status: "DONE", completedAt: now },
      });
    }
    const saved = await prisma.techMissionCheck.findUniqueOrThrow({ where: { id: check.id } });
    const resolved = await missionResolved(me.id, mission);
    const toTick = toView(saved, resolved).toTick;
    if (!toTick.length) return NextResponse.json(toView(saved, resolved));
    await writeRoadmapProgress(me.id, [
      { sectionId: mission.sectionId, topicId: mission.topicId, grade: mission.band as Grade, resolvedSkills: [...resolved, ...toTick] },
    ]);
    return NextResponse.json({ ...toView(saved, [...resolved, ...toTick]), ticked: toTick });
  } catch (e) {
    console.error("mission self-check grading failed", e);
    return serverError("Couldn't grade your answers. Try submitting again.");
  }
}
