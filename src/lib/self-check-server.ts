import type { PdpSelfCheck } from "@prisma/client";
import prisma from "@/lib/prisma";
import { buildRoadmap } from "@/lib/roadmap";
import { baseGrade, gradeLabel, nextGrade } from "@/lib/grades";
import { badRequest, forbidden, notFound } from "@/lib/api-helpers";
import {
  SELF_CHECK_PASS,
  publicQuestions,
  skillsToTick,
  type SelfCheckAnswer,
  type SelfCheckLanguage,
  type SelfCheckQuestion,
  type SelfCheckVerdict,
  type SelfCheckView,
} from "@/lib/self-check";

/** Plans whose goals can be self-checked: being worked through, or done. */
const CHECKABLE = new Set(["ACTIVE", "COMPLETED"]);

/**
 * The goal, if `userId` owns its plan and the plan can be checked. Self-checks
 * are the employee's private practice, so nobody else gets through — not the
 * manager, not an admin.
 */
export async function loadOwnGoal(pdpId: string, goalId: string, userId: string) {
  const goal = await prisma.pdpGoal.findUnique({
    where: { id: goalId },
    select: {
      id: true,
      title: true,
      matrixTopicId: true,
      items: { orderBy: { order: "asc" }, select: { type: true, text: true } },
      pdp: { select: { id: true, userId: true, status: true, user: { select: { grade: true } } } },
    },
  });
  if (!goal || goal.pdp.id !== pdpId) return { error: notFound("Goal not found"), goal: null };
  if (goal.pdp.userId !== userId) return { error: forbidden("Only the plan's owner can check themselves"), goal: null };
  if (!CHECKABLE.has(goal.pdp.status)) return { error: badRequest("The plan isn't active yet"), goal: null };
  return { error: null, goal };
}

export type OwnGoal = NonNullable<Awaited<ReturnType<typeof loadOwnGoal>>["goal"]>;

/**
 * The goal's matrix topic on the user's roadmap at the band they're climbing
 * toward: its skills (to tag questions) and what is already ticked.
 */
export async function goalTopicContext(userId: string, goal: OwnGoal) {
  const grade = goal.pdp.user.grade;
  const target = nextGrade(grade) ?? grade;
  const band = baseGrade(target);
  const empty = { band, targetGradeLabel: gradeLabel(target), sectionId: null as string | null, skills: [] as string[], resolved: [] as string[] };
  if (!goal.matrixTopicId) return empty;
  const roadmap = await buildRoadmap(userId);
  for (const section of roadmap.sections) {
    const topic = section.topics.find((t) => t.id === goal.matrixTopicId);
    if (topic) {
      return { ...empty, sectionId: section.id, skills: topic.skills[band], resolved: topic.resolvedSkills[band] };
    }
  }
  return empty;
}

export function toView(check: PdpSelfCheck, resolved: string[]): SelfCheckView {
  const questions = check.questions as unknown as SelfCheckQuestion[];
  const verdicts = (check.verdicts as unknown as SelfCheckVerdict[] | null) ?? null;
  const submitted = Boolean(check.submittedAt && verdicts);
  return {
    id: check.id,
    language: check.language as SelfCheckLanguage,
    createdAt: check.createdAt.toISOString(),
    submittedAt: check.submittedAt?.toISOString() ?? null,
    score: check.score,
    passed: (check.score ?? 0) >= SELF_CHECK_PASS,
    // The answer key only leaves the server once the attempt is in.
    questions: submitted ? questions : publicQuestions(questions),
    answers: (check.answers as unknown as SelfCheckAnswer[] | null) ?? null,
    verdicts,
    toTick: submitted && verdicts ? skillsToTick(questions, verdicts, resolved) : [],
  };
}

/** Latest submitted score per goal of a plan, for the owner's own badges. */
export async function latestScores(userId: string, goalIds: string[]): Promise<Record<string, number>> {
  if (!goalIds.length) return {};
  const rows = await prisma.pdpSelfCheck.findMany({
    where: { userId, goalId: { in: goalIds }, submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
    select: { goalId: true, score: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (!(r.goalId in out) && r.score !== null) out[r.goalId] = r.score;
  return out;
}
