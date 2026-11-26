import type { TechMission } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildRoadmap } from "@/lib/roadmap";
import { baseGrade, gradeLabel, nextGrade } from "@/lib/grades";
import { matrixInterviewStats } from "@/lib/question-bank";
import { notFound } from "@/lib/api-helpers";
import type { RoadmapDTO } from "@/lib/roadmap-types";
import type { Grade } from "@/lib/types";
import {
  MISSION_OPTIONS,
  STRUGGLE_SCORE,
  missionStreak,
  offeredAgainFrom,
  rankMissionTopics,
  recentTopics,
  weekStartOf,
  type CoachSignals,
  type CoachState,
  type MissionOption,
  type MissionPlan,
  type MissionReason,
  type MissionView,
} from "@/lib/mission";

/**
 * How people of a division did on each topic at assessments for `band`:
 * how many were assessed on it and how many scored below STRUGGLE_SCORE.
 * Only the newest result per person and topic counts.
 */
export async function divisionStruggle(divisionId: string, band: Grade): Promise<CoachSignals["struggle"]> {
  const rows = await prisma.assessmentResult.findMany({
    where: {
      score: { not: null },
      assessment: {
        status: "COMPLETED",
        participants: { some: { participantRole: "SUBJECT", user: { divisionId } } },
      },
    },
    select: {
      category: true,
      score: true,
      assessment: {
        select: {
          grade: true,
          completedAt: true,
          participants: { where: { participantRole: "SUBJECT" }, select: { userId: true } },
        },
      },
    },
  });
  const latest = new Map<string, { at: number; score: number }>(); // `${topic}::${user}`
  for (const r of rows) {
    if (baseGrade(r.assessment.grade) !== band) continue;
    const at = r.assessment.completedAt?.getTime() ?? 0;
    for (const p of r.assessment.participants) {
      const key = `${r.category}::${p.userId}`;
      const prev = latest.get(key);
      if (!prev || at > prev.at) latest.set(key, { at, score: r.score! });
    }
  }
  const out: CoachSignals["struggle"] = {};
  for (const [key, { score }] of latest) {
    const topic = key.slice(0, key.indexOf("::"));
    const t = (out[topic] ??= { assessed: 0, weak: 0 });
    t.assessed++;
    if (score < STRUGGLE_SCORE) t.weak++;
  }
  return out;
}

async function coachSignals(
  userId: string,
  divisionId: string | null,
  band: Grade,
  missions: Array<{ topicId: string; status: string; createdAt: Date }>,
  now: Date
): Promise<CoachSignals> {
  const [struggle, goals, asked] = await Promise.all([
    divisionId ? divisionStruggle(divisionId, band) : Promise.resolve({}),
    prisma.pdpGoal.findMany({
      where: { pdp: { userId, status: "ACTIVE" }, matrixTopicId: { not: null } },
      select: { matrixTopicId: true },
    }),
    divisionId ? matrixInterviewStats(divisionId) : Promise.resolve({ topics: {}, skills: {} }),
  ]);
  return {
    struggle,
    pdpTopicIds: new Set(goals.map((g) => g.matrixTopicId!)),
    asked,
    recentTopicIds: recentTopics(missions, now),
  };
}

type MissionWithScore = TechMission & { checks: Array<{ score: number | null }> };

export function toMissionView(m: MissionWithScore): MissionView {
  return {
    id: m.id,
    topicId: m.topicId,
    topicTitle: m.topicTitle,
    band: m.band as Grade,
    skills: m.skills,
    reasons: m.reasons as unknown as MissionReason[],
    language: m.language,
    plan: m.plan as unknown as MissionPlan,
    status: m.status as MissionView["status"],
    createdAt: m.createdAt.toISOString(),
    completedAt: m.completedAt?.toISOString() ?? null,
    checkScore: m.checks[0]?.score ?? null,
  };
}

const latestCheck = {
  where: { submittedAt: { not: null } },
  orderBy: { submittedAt: "desc" as const },
  take: 1,
  select: { score: true },
};

/** The person's grade, division and next band — or null when there's nothing to coach toward. */
async function coachTarget(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { grade: true, divisionId: true, division: { select: { name: true } } } });
  const target = nextGrade(user?.grade);
  if (!user || !target) return null;
  return { divisionId: user.divisionId, stack: user.division?.name ?? null, target, band: baseGrade(target) as Grade };
}

/** Topics to start a mission on, best first. `roadmap` is reused when the caller has it. */
export async function missionOptions(userId: string, now = new Date(), roadmap?: RoadmapDTO) {
  const t = await coachTarget(userId);
  if (!t) return null;
  const missions = await prisma.techMission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { topicId: true, status: true, createdAt: true },
  });
  const [rm, signals] = await Promise.all([
    roadmap ? Promise.resolve(roadmap) : buildRoadmap(userId),
    coachSignals(userId, t.divisionId, t.band, missions, now),
  ]);
  return { ...t, options: rankMissionTopics(rm, t.band, signals) };
}

/** Everything the mission card shows. */
export async function loadCoachState(userId: string, now = new Date()): Promise<CoachState> {
  const t = await coachTarget(userId);
  const empty: CoachState = { available: false, targetGradeLabel: null, mission: null, options: [], streak: 0, done: 0, history: [] };
  if (!t) return empty;

  const missions = await prisma.techMission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { checks: latestCheck },
  });
  const finished = missions.filter((m) => m.status === "DONE" && m.completedAt);
  const thisWeek = weekStartOf(now);
  const current =
    missions.find((m) => m.status === "ACTIVE") ??
    finished.find((m) => weekStartOf(m.completedAt!) === thisWeek) ??
    null;

  let options: MissionOption[] = [];
  if (current?.status !== "ACTIVE") {
    const roadmap = await buildRoadmap(userId);
    const signals = await coachSignals(userId, t.divisionId, t.band, missions, now);
    options = rankMissionTopics(roadmap, t.band, signals).slice(0, MISSION_OPTIONS);
  }

  return {
    available: true,
    targetGradeLabel: gradeLabel(t.target),
    mission: current ? toMissionView(current) : null,
    options,
    streak: missionStreak(finished.map((m) => m.completedAt!), now),
    done: finished.length,
    history: missions
      .filter((m) => m.status !== "ACTIVE")
      .map((m) => ({ ...toMissionView(m), offeredAgainFrom: offeredAgainFrom(m.createdAt, now) })),
  };
}

export async function coachStack(userId: string) {
  return (await coachTarget(userId))?.stack ?? null;
}

/** The mission, if it belongs to `userId`. Missions are private to their owner. */
export async function loadOwnMission(id: string, userId: string) {
  const mission = await prisma.techMission.findUnique({ where: { id }, include: { checks: latestCheck } });
  if (!mission || mission.userId !== userId) return { error: notFound("Mission not found"), mission: null };
  return { error: null, mission };
}

/** The mission topic's skills already ticked on the person's roadmap at the mission's band. */
export async function missionResolved(userId: string, mission: Pick<TechMission, "topicId" | "band">): Promise<string[]> {
  const roadmap = await buildRoadmap(userId);
  for (const section of roadmap.sections) {
    const topic = section.topics.find((t) => t.id === mission.topicId);
    if (topic) return topic.resolvedSkills[mission.band as Grade] ?? [];
  }
  return [];
}
