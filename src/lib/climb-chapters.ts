import { baseGrade, nextGrade } from "@/lib/grades";
import type { RoadmapDTO, RoadmapStatus } from "@/lib/roadmap-types";
import type { Grade } from "@/lib/types";

/**
 * The climb: a career as a mountain, grades as camps, and each leg between
 * two camps as a chapter. A chapter is closed by a grade upgrade; the PDPs
 * started on that leg and the assessments taken on it belong to it.
 * Client-safe (no prisma) so the pieces can be tested and rendered anywhere.
 */

/** Readiness (0–100) at which the page suggests requesting an assessment. */
export const READY_THRESHOLD = 70;

/**
 * Share of the leg's trail where the high camp sits. Readiness walks the
 * climber from the current camp up to it (reached at READY_THRESHOLD); the
 * last stretch to the next camp is only ever taken by an assessment, so no
 * amount of plan work or roadmap ticks puts anyone on the summit.
 */
export const HIGH_CAMP = 0.85;

/** Where on the leg (0–1 of the trail) the climber stands for a readiness percent. */
export function legPosition(readiness: number): number {
  return Math.min(Math.max(readiness, 0) / READY_THRESHOLD, 1) * HIGH_CAMP;
}

/** How far a topic counts toward readiness, by roadmap status. */
function topicReadiness(status: RoadmapStatus, resolved: number, total: number): number {
  if (status === "mastered") return 1;
  const ticked = total ? resolved / total : 0;
  // Assessed but not mastered: the topic was covered at an assessment, so it
  // counts for more than an untouched one, but ticked questions can take it further.
  return status === "assessed" ? Math.max(0.6, ticked) : ticked;
}

export interface FocusTopic {
  id: string;
  title: string;
  section: string;
  status: RoadmapStatus;
  resolved: number;
  total: number;
}

export interface Readiness {
  /** The roadmap band the next grade is measured against. */
  band: Grade;
  percent: number;
  mastered: number;
  topics: number;
  /** Least covered topics of the band, weakest first. */
  focus: FocusTopic[];
}

/**
 * How ready the user is for `targetGrade`, from their roadmap: the average
 * coverage of every topic that has skills listed for the target's band.
 */
export function readinessFor(roadmap: RoadmapDTO, targetGrade: string, focusCount = 3): Readiness {
  const band = baseGrade(targetGrade);
  const scored: Array<FocusTopic & { score: number }> = [];
  for (const section of roadmap.sections) {
    for (const topic of section.topics) {
      const total = topic.skills[band].length;
      if (!total) continue;
      const resolved = topic.resolvedSkills[band].length;
      const status = topic.status[band];
      scored.push({
        id: topic.id,
        title: topic.title,
        section: section.title,
        status,
        resolved,
        total,
        score: topicReadiness(status, resolved, total),
      });
    }
  }
  const sum = scored.reduce((s, t) => s + t.score, 0);
  const focus = scored
    .filter((t) => t.status !== "mastered")
    .sort((a, b) => a.score - b.score)
    .slice(0, focusCount)
    .map(({ score: _score, ...t }) => t);
  return {
    band,
    percent: scored.length ? Math.round((sum / scored.length) * 100) : 0,
    mastered: scored.filter((t) => t.status === "mastered").length,
    topics: scored.length,
    focus,
  };
}

/** What the summit push (the assessment for the next grade) looks like right now. */
export type SummitPush =
  | { kind: "summit" }
  | { kind: "scheduled"; assessmentId: string; scheduledAt: Date | null }
  | { kind: "requested" }
  | { kind: "ready" }
  | { kind: "needs-cert" }
  | { kind: "climbing" };

export function summitPush(input: {
  grade: string | null;
  readiness: number;
  hasCertificate: boolean;
  upcomingAssessment: { id: string; scheduledAt: Date | null } | null;
  pendingRequest: boolean;
}): SummitPush {
  if (input.grade && !nextGrade(input.grade)) return { kind: "summit" };
  if (input.upcomingAssessment) {
    return {
      kind: "scheduled",
      assessmentId: input.upcomingAssessment.id,
      scheduledAt: input.upcomingAssessment.scheduledAt,
    };
  }
  if (input.pendingRequest) return { kind: "requested" };
  if (input.readiness < READY_THRESHOLD) return { kind: "climbing" };
  // An upgrade needs at least one certificate, so say so before the request.
  return input.hasCertificate ? { kind: "ready" } : { kind: "needs-cert" };
}

export interface ChapterAssessment {
  id: string;
  title: string;
  completedAt: Date | null;
  reviewedAt: Date | null;
  gradeUpgraded: boolean;
  previousGrade: string | null;
  newGrade: string | null;
}

export interface ChapterPdp {
  id: string;
  fileName: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
}

export interface PastChapter {
  number: number;
  fromGrade: string | null;
  toGrade: string;
  /** When the leg started: the previous upgrade, or null for the first one we know of. */
  startedAt: Date | null;
  reachedAt: Date;
  /** The assessment that took the camp. */
  assessmentId: string;
  /** Assessments on this leg that did not end in an upgrade. */
  attempts: number;
  pdps: ChapterPdp[];
}

export interface ChapterLog {
  past: PastChapter[];
  current: {
    number: number;
    startedAt: Date | null;
    pdps: ChapterPdp[];
    attempts: number;
  };
}

const finishedAt = (a: ChapterAssessment) => a.reviewedAt ?? a.completedAt;

/**
 * Split the user's history into chapters. Every upgraded assessment closes a
 * chapter; PDPs and non-upgrade assessments fall into the chapter whose window
 * contains their start (or completion) date. Whatever comes after the last
 * upgrade is the current chapter, and a plan still active always belongs to
 * it, even one started before the last upgrade.
 */
export function buildChapterLog(assessments: ChapterAssessment[], pdps: ChapterPdp[]): ChapterLog {
  const done = assessments
    .filter((a) => finishedAt(a))
    .sort((a, b) => finishedAt(a)!.getTime() - finishedAt(b)!.getTime());
  const upgrades = done.filter((a) => a.gradeUpgraded && a.newGrade);

  const inWindow = (d: Date, from: Date | null, to: Date | null) =>
    (!from || d >= from) && (!to || d < to);

  const past: PastChapter[] = [];
  let from: Date | null = null;
  for (const up of upgrades) {
    const to = finishedAt(up)!;
    past.push({
      number: past.length + 1,
      fromGrade: up.previousGrade,
      toGrade: up.newGrade!,
      startedAt: from,
      reachedAt: to,
      assessmentId: up.id,
      attempts: done.filter((a) => !a.gradeUpgraded && inWindow(finishedAt(a)!, from, to)).length,
      pdps: pdps.filter((p) => p.status !== "ACTIVE" && inWindow(p.startedAt, from, to)),
    });
    from = to;
  }

  return {
    past,
    current: {
      number: past.length + 1,
      startedAt: from,
      pdps: pdps.filter((p) => p.status === "ACTIVE" || inWindow(p.startedAt, from, null)),
      attempts: done.filter((a) => !a.gradeUpgraded && inWindow(finishedAt(a)!, from, null)).length,
    },
  };
}

/** Whole months between two dates, at least 1 — for "took 7 months". */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(1, months);
}
