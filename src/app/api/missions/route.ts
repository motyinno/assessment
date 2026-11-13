import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { badRequest, conflict, errorJson, parseJsonBody, serverError } from "@/lib/api-helpers";
import { generateMissionPlan } from "@/lib/ai-service";
import { gradeLabel } from "@/lib/grades";
import { SELF_CHECK_LANGUAGES } from "@/lib/self-check";
import { parseMissionPlan, weekStartOf } from "@/lib/mission";
import { loadCoachState, missionOptions, toMissionView } from "@/lib/mission-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Missions one person may start per hour (each is an AI call). */
const HOURLY_LIMIT = 5;

/** The tech coach card: the current mission or topics to start one on. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  return NextResponse.json(await loadCoachState(auth.session.user.id));
}

const startSchema = z.object({
  topicId: z.string().min(1).max(100),
  language: z.enum(SELF_CHECK_LANGUAGES).default("ru"),
});

/** Start a mission on one of the proposed topics: the AI writes its plan. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const parsed = await parseJsonBody(req, startSchema);
  if (parsed.error) return parsed.error;
  const { topicId } = parsed.data;
  const language = parsed.data.language ?? "ru";

  if (await prisma.techMission.findFirst({ where: { userId: me.id, status: "ACTIVE" }, select: { id: true } })) {
    return conflict("Finish or drop your current mission first");
  }
  const recent = await prisma.techMission.count({
    where: { userId: me.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (recent >= HOURLY_LIMIT) {
    return errorJson("RATE_LIMITED", "That's a lot of missions for one hour — come back a bit later.", 429);
  }

  const now = new Date();
  const ranked = await missionOptions(me.id, now);
  if (!ranked) return badRequest("There's no next grade to work toward");
  // Only topics the coach itself proposes, so a mission always fits the person's roadmap.
  const option = ranked.options.find((o) => o.topicId === topicId);
  if (!option) return badRequest("This topic isn't open on your roadmap");

  try {
    const plan = parseMissionPlan(
      await generateMissionPlan({
        topicTitle: option.topicTitle,
        section: option.section,
        skills: option.skills,
        targetGradeLabel: gradeLabel(ranked.target),
        stack: ranked.stack,
        language,
      })
    );
    const mission = await prisma.techMission.create({
      data: {
        userId: me.id,
        weekStart: weekStartOf(now),
        sectionId: option.sectionId,
        topicId: option.topicId,
        topicTitle: option.topicTitle,
        band: option.band,
        skills: option.skills,
        reasons: option.reasons as object[],
        language,
        plan: plan as object,
      },
    });
    return NextResponse.json(toMissionView({ ...mission, checks: [] }), { status: 201 });
  } catch (e) {
    console.error("mission plan generation failed", e);
    return serverError("Couldn't prepare the mission. Try again in a minute.");
  }
}
