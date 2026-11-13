import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { errorJson, parseJsonBody, serverError } from "@/lib/api-helpers";
import { generateSelfCheck } from "@/lib/ai-service";
import { BAND_LABELS } from "@/lib/roadmap-types";
import { SELF_CHECK_LANGUAGES, parseGeneratedQuestions } from "@/lib/self-check";
import { toView } from "@/lib/self-check-server";
import { loadOwnMission, missionResolved } from "@/lib/mission-server";
import type { MissionPlan } from "@/lib/mission";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** New attempts one person may start per hour, across missions. */
const HOURLY_LIMIT = 10;

type Params = { params: { id: string } };

/** The owner's latest attempt at this mission, or null. */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, mission } = await loadOwnMission(params.id, me.id);
  if (error) return error;

  const check = await prisma.techMissionCheck.findFirst({ where: { missionId: mission.id }, orderBy: { createdAt: "desc" } });
  if (!check) return NextResponse.json(null);
  return NextResponse.json(toView(check, await missionResolved(me.id, mission)));
}

const startSchema = z.object({ language: z.enum(SELF_CHECK_LANGUAGES).default("ru") });

/** Start a new attempt: the AI writes questions on the mission's skills. */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { error, mission } = await loadOwnMission(params.id, me.id);
  if (error) return error;
  const parsed = await parseJsonBody(req, startSchema);
  if (parsed.error) return parsed.error;

  const recent = await prisma.techMissionCheck.count({
    where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= HOURLY_LIMIT) {
    return errorJson("RATE_LIMITED", "That's a lot of checks for one hour — take a break and come back later.", 429);
  }

  const language = parsed.data.language ?? "ru";
  const plan = mission.plan as unknown as MissionPlan;
  try {
    const raw = await generateSelfCheck({
      goalTitle: mission.topicTitle,
      items: [
        ...plan.steps.map((s) => ({ type: s.kind === "practice" ? ("PRACTICE" as const) : ("THEORY" as const), text: `${s.title}: ${s.detail}` })),
        { type: "PRACTICE" as const, text: `${plan.task.title}: ${plan.task.description}` },
      ],
      skills: mission.skills,
      targetGradeLabel: BAND_LABELS[mission.band as Grade] ?? mission.band,
      language,
    });
    const questions = parseGeneratedQuestions(raw, mission.skills);
    const check = await prisma.techMissionCheck.create({
      data: { missionId: mission.id, userId: me.id, language, questions: questions as object[] },
    });
    return NextResponse.json(toView(check, await missionResolved(me.id, mission)), { status: 201 });
  } catch (e) {
    console.error("mission self-check generation failed", e);
    return serverError("Couldn't prepare the questions. Try again in a minute.");
  }
}
