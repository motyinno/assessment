import prisma from "@/lib/prisma";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade } from "@/lib/grades";
import type { Grade } from "@/lib/types";
import {
  BANDS,
  combineStatus,
  type RoadmapSectionDTO,
  type RoadmapDTO,
} from "@/lib/roadmap-types";

/**
 * The next base grade above `grade`, or null if already senior.
 */
function nextBand(grade: Grade): Grade | null {
  const idx = BANDS.indexOf(grade);
  return idx >= 0 && idx < BANDS.length - 1 ? BANDS[idx + 1] : null;
}

/**
 * Build a user's interactive roadmap: the tech matrix augmented with per-topic,
 * per-band status derived from (a) their most recent assessment scores and
 * (b) their self-tracked per-question progress (RoadmapProgress.resolvedSkills).
 */
export async function buildRoadmap(userId: string): Promise<RoadmapDTO> {
  const matrix = await loadTechMatrix();

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
      where: { userId },
      select: { topicId: true, grade: true, resolvedSkills: true, done: true },
    }),
  ]);

  // Resolve one score per (topic, band). An assessment's scores only inform the
  // band it was taken at (baseGrade of the assessment's grade) — a Junior
  // assessment never marks mid/sen topics. Newest assessment wins; within an
  // assessment, the assessor result beats the subject's self-assessment.
  const scoreByTopicBand = new Map<string, number>(); // key: `${topicId}::${band}`
  const key = (topicId: string, band: Grade) => `${topicId}::${band}`;
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

  // Manual per-question progress, keyed by topic::band. A row's `resolvedSkills`
  // is the ticked set; a legacy `done` row with no resolvedSkills means "all".
  const progressByTopicBand = new Map<
    string,
    { resolved: string[]; legacyDone: boolean }
  >();
  for (const row of progressRows) {
    const band = row.grade as Grade;
    if (!BANDS.includes(band)) continue;
    progressByTopicBand.set(key(row.topicId, band), {
      resolved: row.resolvedSkills,
      legacyDone: row.done,
    });
  }

  const sections: RoadmapSectionDTO[] = matrix.sections.map((section) => ({
    id: section.id,
    title: section.title,
    topics: section.topics.map((topic) => {
      const skills: Record<Grade, string[]> = {
        jun: topic.jun,
        mid: topic.mid,
        sen: topic.sen,
      };

      const scoreFor = (band: Grade) =>
        scoreByTopicBand.has(key(topic.id, band))
          ? scoreByTopicBand.get(key(topic.id, band))!
          : null;

      // Resolved skills for a band = stored set ∩ current skills; a legacy
      // `done` row with an empty set counts as all skills resolved.
      const resolvedFor = (band: Grade): string[] => {
        const entry = progressByTopicBand.get(key(topic.id, band));
        if (!entry) return [];
        const current = new Set(skills[band]);
        const intersect = entry.resolved.filter((s) => current.has(s));
        if (intersect.length === 0 && entry.legacyDone) return [...skills[band]];
        return intersect;
      };

      const scores: Record<Grade, number | null> = {
        jun: scoreFor("jun"),
        mid: scoreFor("mid"),
        sen: scoreFor("sen"),
      };
      const resolvedSkills: Record<Grade, string[]> = {
        jun: resolvedFor("jun"),
        mid: resolvedFor("mid"),
        sen: resolvedFor("sen"),
      };

      const statusFor = (band: Grade) =>
        combineStatus(
          scores[band],
          resolvedSkills[band].length,
          skills[band].length
        );

      return {
        id: topic.id,
        title: topic.title,
        skills,
        status: {
          jun: statusFor("jun"),
          mid: statusFor("mid"),
          sen: statusFor("sen"),
        },
        scores,
        resolvedSkills,
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

export interface RoadmapProgressItem {
  sectionId: string;
  topicId: string;
  grade: Grade;
  resolvedSkills: string[];
}

/**
 * Persist a user's per-question progress. For each (topic, grade): an empty
 * `resolvedSkills` deletes the row; otherwise it upserts the exact ticked set.
 * Runs in one transaction so a partial save can't leave mixed state.
 */
export async function writeRoadmapProgress(
  userId: string,
  items: RoadmapProgressItem[]
): Promise<void> {
  await prisma.$transaction(
    items.map((item) =>
      item.resolvedSkills.length === 0
        ? prisma.roadmapProgress.deleteMany({
            where: { userId, topicId: item.topicId, grade: item.grade },
          })
        : prisma.roadmapProgress.upsert({
            where: {
              userId_topicId_grade: {
                userId,
                topicId: item.topicId,
                grade: item.grade,
              },
            },
            update: { resolvedSkills: item.resolvedSkills, done: false },
            create: {
              userId,
              sectionId: item.sectionId,
              topicId: item.topicId,
              grade: item.grade,
              resolvedSkills: item.resolvedSkills,
              done: false,
            },
          })
    )
  );
}
