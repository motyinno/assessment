import prisma from "@/lib/prisma";
import { buildRoadmap } from "@/lib/roadmap";
import { nextGrade } from "@/lib/grades";
import { SUBJECT_VISIBLE_STATUSES } from "@/lib/pdp-plan";
import { latestScores } from "@/lib/self-check-server";
import {
  buildChapterLog,
  readinessFor,
  summitPush,
  type ChapterLog,
  type Readiness,
  type SummitPush,
} from "@/lib/climb-chapters";

export interface Waypoint {
  id: string;
  title: string;
  done: number;
  total: number;
  /** Roadmap status of the goal's matrix topic at the target band, when linked. */
  topicStatus: string | null;
  /** The owner's latest self-check score on this goal, if any. */
  selfCheck: number | null;
}

export interface Climb {
  grade: string | null;
  target: string | null;
  chapters: ChapterLog;
  /**
   * The plans of the current chapter, oldest first — each new PDP adds its
   * goals further up the same trail. A closed plan's goals count as passed:
   * the manager closes a plan when it's done, not when every item is ticked.
   */
  plans: Array<{ id: string; fileName: string; status: string; waypoints: Waypoint[] }>;
  readiness: Readiness | null;
  push: SummitPush;
}

/** Roadmap readiness for the grade after `grade`, or null at the summit / without a grade. */
export async function loadReadiness(userId: string, grade: string | null): Promise<Readiness | null> {
  const target = nextGrade(grade);
  if (!target) return null;
  return readinessFor(await buildRoadmap(userId), target);
}

/**
 * Everything the climb page shows for one user: the current chapter (grade →
 * next grade, its plans' goals as waypoints, roadmap readiness, the state
 * of the summit push) and the chapters already climbed.
 */
export async function loadClimb(userId: string): Promise<Climb> {
  const [user, assessments, pdps, upcoming, pendingRequest, certificates] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { grade: true } }),
    prisma.assessment.findMany({
      where: { status: "COMPLETED", participants: { some: { userId, participantRole: "SUBJECT" } } },
      select: {
        id: true,
        title: true,
        completedAt: true,
        reviewedAt: true,
        gradeUpgraded: true,
        previousGrade: true,
        newGrade: true,
      },
    }),
    prisma.pdp.findMany({
      where: { userId, status: { in: [...SUBJECT_VISIBLE_STATUSES] } },
      select: {
        id: true,
        fileName: true,
        status: true,
        startedAt: true,
        completedAt: true,
        goals: {
          orderBy: { order: "asc" },
          select: { id: true, title: true, matrixTopicId: true, items: { select: { doneAt: true } } },
        },
      },
      orderBy: { startedAt: "asc" },
    }),
    prisma.assessment.findFirst({
      where: {
        status: { in: ["PLANNED", "IN_PROGRESS"] },
        participants: { some: { userId, participantRole: "SUBJECT" } },
      },
      select: { id: true, scheduledAt: true },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.assessmentRequest.count({ where: { userId, status: "PENDING" } }),
    prisma.certificate.count({ where: { userId } }),
  ]);

  const grade = user?.grade ?? null;
  const target = nextGrade(grade);
  const roadmap = target ? await buildRoadmap(userId) : null;
  const readiness = roadmap && target ? readinessFor(roadmap, target) : null;

  const statusByTopic = new Map<string, string>();
  if (roadmap && readiness) {
    for (const s of roadmap.sections) for (const t of s.topics) statusByTopic.set(t.id, t.status[readiness.band]);
  }

  const chapters = buildChapterLog(assessments, pdps);
  const inChapter = new Set(chapters.current.pdps.map((p) => p.id));
  const scores = await latestScores(
    userId,
    pdps.filter((p) => inChapter.has(p.id)).flatMap((p) => p.goals.map((g) => g.id))
  );

  return {
    grade,
    target,
    chapters,
    plans: pdps
      .filter((p) => inChapter.has(p.id) && p.goals.length > 0)
      .map((p) => ({
        id: p.id,
        fileName: p.fileName,
        status: p.status,
        waypoints: p.goals.map((g) => {
          const total = g.items.length;
          return {
            id: g.id,
            title: g.title,
            done: p.status === "COMPLETED" ? total : g.items.filter((i) => i.doneAt).length,
            total,
            topicStatus: g.matrixTopicId ? statusByTopic.get(g.matrixTopicId) ?? null : null,
            selfCheck: scores[g.id] ?? null,
          };
        }),
      })),
    readiness,
    push: summitPush({
      grade,
      readiness: readiness?.percent ?? 0,
      hasCertificate: certificates > 0,
      upcomingAssessment: upcoming,
      pendingRequest: pendingRequest > 0,
    }),
  };
}
