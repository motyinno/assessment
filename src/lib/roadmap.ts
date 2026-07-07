import prisma from "@/lib/prisma";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade } from "@/lib/grades";
import type { Grade } from "@/lib/types";
import {
  BANDS,
  type RoadmapStatus,
  type RoadmapSectionDTO,
  type RoadmapDTO,
} from "@/lib/roadmap-types";

/**
 * Score at or above which a topic counts as "mastered" for a grade band.
 * Scores are on a 0-10 scale (both self-assessment and assessor results).
 */
const MASTERY_THRESHOLD = 8;
/** Score at or above which a topic counts as "assessed" (touched, not mastered). */
const ASSESSED_THRESHOLD = 4;

/**
 * Fold a resolved score + manual mark into a single status for one grade band.
 */
function deriveStatus(score: number | null, manualDone: boolean): RoadmapStatus {
  if (manualDone) return "mastered";
  if (score === null) return "not-started";
  if (score >= MASTERY_THRESHOLD) return "mastered";
  if (score >= ASSESSED_THRESHOLD) return "assessed";
  return "in-progress";
}

/**
 * The next base grade above `grade`, or null if already senior. Walks the
 * ordered GRADE_VALUES so the +/- steps between bands are respected.
 */
function nextBand(grade: Grade): Grade | null {
  const idx = BANDS.indexOf(grade);
  return idx >= 0 && idx < BANDS.length - 1 ? BANDS[idx + 1] : null;
}

/**
 * Build a user's interactive roadmap: the tech matrix augmented with per-topic,
 * per-band status derived from (a) their most recent assessment scores and
 * (b) their self-tracked RoadmapProgress marks.
 */
export async function buildRoadmap(userId: string): Promise<RoadmapDTO> {
  const matrix = loadTechMatrix();

  const [user, assessments, progressRows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { grade: true } }),
    prisma.assessment.findMany({
      where: {
        status: "COMPLETED",
        participants: { some: { userId, participantRole: "SUBJECT" } },
      },
      orderBy: { completedAt: "desc" },
      include: { results: true, selfAssessments: true },
    }),
    prisma.roadmapProgress.findMany({
      where: { userId, done: true },
      select: { topicId: true, grade: true },
    }),
  ]);

  // Resolve one score per (topic, band). An assessment's scores only inform the
  // band it was taken at (baseGrade of the assessment's grade) — a Junior
  // assessment never marks mid/sen topics. Newest assessment wins; within an
  // assessment, the assessor result beats the subject's self-assessment.
  const scoreByTopicBand = new Map<string, number>(); // key: `${topicId}::${band}`
  const key = (topicId: string, band: Grade) => `${topicId}::${band}`;
  // assessments are ordered newest-first; iterate oldest-first so newer values
  // overwrite older ones.
  for (const a of [...assessments].reverse()) {
    const band = baseGrade(a.grade);
    for (const s of a.selfAssessments) {
      if (s.score !== null && s.score !== undefined) {
        scoreByTopicBand.set(key(s.topicId, band), s.score);
      }
    }
    for (const r of a.results) {
      if (r.score !== null && r.score !== undefined) {
        scoreByTopicBand.set(key(r.category, band), r.score);
      }
    }
  }

  const manualByTopic = new Map<string, Set<Grade>>();
  for (const row of progressRows) {
    const band = row.grade as Grade;
    if (!BANDS.includes(band)) continue;
    const set = manualByTopic.get(row.topicId) ?? new Set<Grade>();
    set.add(band);
    manualByTopic.set(row.topicId, set);
  }

  const sections: RoadmapSectionDTO[] = matrix.sections.map((section) => ({
    id: section.id,
    title: section.title,
    topics: section.topics.map((topic) => {
      const scoreFor = (band: Grade) =>
        scoreByTopicBand.has(key(topic.id, band))
          ? scoreByTopicBand.get(key(topic.id, band))!
          : null;
      const scores: Record<Grade, number | null> = {
        jun: scoreFor("jun"),
        mid: scoreFor("mid"),
        sen: scoreFor("sen"),
      };
      const manual = manualByTopic.get(topic.id) ?? new Set<Grade>();

      const manualDone: Record<Grade, boolean> = {
        jun: manual.has("jun"),
        mid: manual.has("mid"),
        sen: manual.has("sen"),
      };

      return {
        id: topic.id,
        title: topic.title,
        skills: { jun: topic.jun, mid: topic.mid, sen: topic.sen },
        status: {
          jun: deriveStatus(scores.jun, manualDone.jun),
          mid: deriveStatus(scores.mid, manualDone.mid),
          sen: deriveStatus(scores.sen, manualDone.sen),
        },
        scores,
        manualDone,
      };
    }),
  }));

  const currentGrade = baseGrade(user?.grade);

  return {
    sections,
    currentGrade,
    nextGrade: nextBand(currentGrade),
  };
}
