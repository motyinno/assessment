import { z } from "zod";
import type { InterviewQuestionKind, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { loadTechMatrix } from "@/lib/data-loader";
import { log } from "@/lib/logger";
import { mapInterviewQuestions } from "@/lib/ai-service";

/**
 * Interview question bank: questions asked at real client interviews,
 * attached to topics of a division's tech matrix. They show on the roadmap
 * ("asked at client interviews") and go to the AI as real examples when it
 * drafts PDPs and assessor interview prep.
 *
 * Questions come in through an import (interview-questions/v1 JSON, already
 * classified) or one by one from the admin page. A repeat of a known question
 * (same normalized text in the division) bumps its `timesAsked` instead of
 * adding a row, so the count reads as "how often clients ask this".
 */

export const KINDS = ["THEORY", "EXPERIENCE", "BEHAVIORAL", "BACKGROUND"] as const;
export const BANDS = ["jun", "mid", "sen"] as const;

export const KIND_LABELS: Record<InterviewQuestionKind, string> = {
  THEORY: "Theory",
  EXPERIENCE: "Experience",
  BEHAVIORAL: "Behavioral",
  BACKGROUND: "Background",
};

const importQuestionSchema = z.object({
  text: z.string().trim().min(3).max(500),
  /** Optional — the AI classifies it when missing. */
  kind: z.enum(KINDS).nullish(),
  topicId: z.string().trim().min(1).max(200).nullish(),
  band: z.enum(BANDS).nullish(),
  timesAsked: z.number().int().min(1).max(10_000).default(1),
  proposedTopic: z.string().trim().min(1).max(120).nullish(),
  /** Exact skill string of the topic the question tests. */
  skill: z.string().trim().min(1).max(200).nullish(),
  /** A skill the topic lacks that the question tests. */
  proposedSkill: z.string().trim().min(1).max(120).nullish(),
});

export const questionImportSchema = z.object({
  schema: z.literal("interview-questions/v1"),
  title: z.string().trim().max(200).nullish(),
  questions: z.array(importQuestionSchema).min(1).max(20_000),
});

export type QuestionImport = z.infer<typeof questionImportSchema>;

/** Dedupe key: lower-case, letters/digits/spaces only, collapsed. */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ImportStats {
  received: number;
  created: number;
  merged: number;
  /** Rows whose topicId isn't in the division's matrix — the AI maps them. */
  unknownTopics: number;
  /** New questions the AI is matching to the matrix in the background. */
  toMap: number;
}

/**
 * Collapse repeats inside one payload and against the matrix. Pure, so it's
 * testable without a database: the first occurrence wins on topic/band/kind,
 * counts add up, an unknown topic id becomes the proposed topic.
 */
export function prepareImport(questions: QuestionImport["questions"], topicIds: Set<string>, topicSkills?: Map<string, Set<string>>) {
  const byKey = new Map<
    string,
    {
      text: string;
      normalized: string;
      kind: InterviewQuestionKind;
      topicId: string | null;
      band: string | null;
      timesAsked: number;
      proposedTopic: string | null;
      skill: string | null;
      proposedSkill: string | null;
      pendingTopic: boolean;
      pendingKind: boolean;
    }
  >();
  let unknownTopics = 0;
  for (const q of questions) {
    const normalized = normalizeQuestion(q.text);
    if (!normalized) continue;
    const known = q.topicId && topicIds.has(q.topicId) ? q.topicId : null;
    if (q.topicId && !known) unknownTopics++;
    const existing = byKey.get(normalized);
    if (existing) {
      existing.timesAsked += q.timesAsked;
      existing.topicId ??= known;
      existing.band ??= q.band ?? null;
      continue;
    }
    // A skill only counts if the topic really has it; otherwise it's a proposal.
    const skillOk = known && q.skill && (topicSkills?.get(known)?.has(q.skill) ?? false);
    const kind = q.kind ?? null;
    // People questions never get a topic; anything else without a valid one
    // goes to the AI, which picks a topic or proposes the missing one.
    const needsTopic = !known && kind !== "BEHAVIORAL" && kind !== "BACKGROUND";
    byKey.set(normalized, {
      text: q.text,
      normalized,
      kind: kind ?? "THEORY",
      topicId: known,
      band: q.band ?? null,
      timesAsked: q.timesAsked,
      proposedTopic: known ? null : q.proposedTopic ?? null,
      skill: skillOk ? q.skill! : null,
      proposedSkill: known ? (skillOk ? null : q.proposedSkill ?? q.skill ?? null) : null,
      pendingTopic: needsTopic,
      pendingKind: !kind,
    });
  }
  return { rows: [...byKey.values()], unknownTopics };
}

export async function divisionTopicIds(departmentId: string): Promise<Set<string>> {
  const matrix = await loadTechMatrix(departmentId);
  return new Set(matrix.sections.flatMap((s) => s.topics.map((t) => t.id)));
}

/** topicId → every skill string of the topic (all bands). */
export async function divisionTopicSkills(departmentId: string): Promise<Map<string, Set<string>>> {
  const matrix = await loadTechMatrix(departmentId);
  return new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, new Set([...t.jun, ...t.mid, ...t.sen])] as const)));
}

/** Import a classified batch into a division's bank. */
export async function importQuestions(opts: {
  departmentId: string;
  payload: QuestionImport;
  createdById: string;
}): Promise<{ importId: string; stats: ImportStats }> {
  const { departmentId, payload } = opts;
  const skills = await divisionTopicSkills(departmentId);
  const { rows, unknownTopics } = prepareImport(payload.questions, new Set(skills.keys()), skills);

  const result = await prisma.$transaction(
    async (tx) => {
      const batch = await tx.interviewQuestionImport.create({
        data: { departmentId, title: payload.title?.trim() || `Import ${new Date().toISOString().slice(0, 10)}`, createdById: opts.createdById },
      });
      const existing = await tx.interviewQuestion.findMany({
        where: { departmentId, normalized: { in: rows.map((r) => r.normalized) } },
        select: { id: true, normalized: true, topicId: true, band: true },
      });
      const known = new Map(existing.map((e) => [e.normalized, e]));

      const fresh = rows.filter((r) => !known.has(r.normalized));
      if (fresh.length) {
        await tx.interviewQuestion.createMany({
          data: fresh.map((r) => ({ ...r, departmentId, importId: batch.id })),
          skipDuplicates: true,
        });
      }
      let merged = 0;
      for (const r of rows) {
        const e = known.get(r.normalized);
        if (!e) continue;
        merged++;
        await tx.interviewQuestion.update({
          where: { id: e.id },
          data: {
            timesAsked: { increment: r.timesAsked },
            // Fill gaps, never overwrite what an admin set.
            ...(e.topicId ? {} : r.topicId ? { topicId: r.topicId, proposedTopic: null } : {}),
            ...(e.band ? {} : r.band ? { band: r.band } : {}),
          },
        });
      }
      const toMap = fresh.filter((r) => r.pendingTopic || r.pendingKind).length;
      const stats: ImportStats = { received: payload.questions.length, created: fresh.length, merged, unknownTopics, toMap };
      await tx.interviewQuestionImport.update({
        where: { id: batch.id },
        data: { stats: stats as unknown as Prisma.InputJsonValue, ...(toMap ? { status: "PROCESSING", mapTotal: toMap, mapDone: 0 } : {}) },
      });
      return { importId: batch.id, stats };
    },
    { timeout: 120_000 }
  );
  if (result.stats.toMap) void runImportMapping(result.importId);
  return result;
}

const MAP_BATCH = 40;

/**
 * Background job: let the AI pick topic, skill, level and kind for an
 * import's pending questions, batch by batch, validating every answer
 * against the live matrix. Never throws; a failure leaves the rest pending
 * and marks the import FAILED so it can be retried.
 */
export async function runImportMapping(importId: string): Promise<void> {
  try {
    const batch = await prisma.interviewQuestionImport.findUniqueOrThrow({ where: { id: importId } });
    const matrix = await loadTechMatrix(batch.departmentId);
    const topics = matrix.sections.flatMap((s) => s.topics.map((t) => ({ id: t.id, section: s.title, title: t.title, jun: t.jun, mid: t.mid, sen: t.sen })));
    const byId = new Map(topics.map((t) => [t.id, t]));

    for (;;) {
      const rows = await prisma.interviewQuestion.findMany({
        where: { importId, OR: [{ pendingTopic: true }, { pendingKind: true }] },
        orderBy: { createdAt: "asc" },
        take: MAP_BATCH,
        select: { id: true, text: true, kind: true, pendingTopic: true, pendingKind: true, band: true, proposedTopic: true },
      });
      if (!rows.length) break;

      const raw = await mapInterviewQuestions(
        rows.map((r, i) => ({ i, text: r.text, kind: r.pendingKind ? null : r.kind })),
        topics
      );
      const results = new Map<number, Record<string, unknown>>();
      const list = (raw as { results?: unknown })?.results;
      if (Array.isArray(list)) for (const x of list) if (x && typeof (x as { i?: unknown }).i === "number") results.set((x as { i: number }).i, x as Record<string, unknown>);

      await prisma.$transaction(
        rows.map((r, i) => {
          const a = results.get(i) ?? {};
          const kind = r.pendingKind && typeof a.kind === "string" && (KINDS as readonly string[]).includes(a.kind) ? (a.kind as InterviewQuestionKind) : r.kind;
          const people = kind === "BEHAVIORAL" || kind === "BACKGROUND";
          const topic = !people && r.pendingTopic && typeof a.topicId === "string" ? byId.get(a.topicId) : undefined;
          const skills = topic ? new Set([...topic.jun, ...topic.mid, ...topic.sen]) : null;
          const skill = topic && typeof a.skill === "string" && skills!.has(a.skill) ? a.skill : null;
          const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
          const band = typeof a.band === "string" && (BANDS as readonly string[]).includes(a.band) ? a.band : null;
          return prisma.interviewQuestion.update({
            where: { id: r.id },
            data: {
              kind,
              pendingKind: false,
              pendingTopic: false,
              ...(r.pendingTopic
                ? {
                    topicId: topic?.id ?? null,
                    skill,
                    proposedSkill: topic && !skill ? str(a.proposedSkill, 120) ?? str(a.skill, 120) : null,
                    proposedTopic: topic || people ? null : str(a.proposedTopic, 120) ?? r.proposedTopic,
                    band: people ? null : r.band ?? band,
                  }
                : {}),
            },
          });
        })
      );
      await prisma.interviewQuestionImport.update({ where: { id: importId }, data: { mapDone: { increment: rows.length } } });
    }
    await prisma.interviewQuestionImport.update({ where: { id: importId }, data: { status: "DONE", error: null } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("Interview question mapping failed", { importId, error: message });
    await prisma.interviewQuestionImport.update({ where: { id: importId }, data: { status: "FAILED", error: message } }).catch(() => {});
  }
}

export interface TopicQuestion {
  id: string;
  text: string;
  kind: InterviewQuestionKind;
  band: string | null;
  timesAsked: number;
  skill: string | null;
}

/**
 * The most-asked visible questions per topic, best matches for `band` first
 * (then unbanded, then other bands). Topic ids are globally unique, so no
 * division filter is needed.
 */
export async function questionsForTopics(
  topicIds: string[],
  opts: { band?: string | null; perTopic?: number; kinds?: InterviewQuestionKind[] } = {}
): Promise<Map<string, TopicQuestion[]>> {
  const out = new Map<string, TopicQuestion[]>();
  if (!topicIds.length) return out;
  const rows = await prisma.interviewQuestion.findMany({
    where: { topicId: { in: topicIds }, hidden: false, ...(opts.kinds ? { kind: { in: opts.kinds } } : {}) },
    orderBy: [{ timesAsked: "desc" }, { createdAt: "asc" }],
    select: { id: true, text: true, kind: true, band: true, timesAsked: true, topicId: true, skill: true },
  });
  const rank = (b: string | null) => (opts.band ? (b === opts.band ? 0 : b === null ? 1 : 2) : 0);
  for (const r of rows) {
    const list = out.get(r.topicId!) ?? [];
    list.push({ id: r.id, text: r.text, kind: r.kind, band: r.band, timesAsked: r.timesAsked, skill: r.skill });
    out.set(r.topicId!, list);
  }
  for (const [k, list] of out) {
    list.sort((a, b) => rank(a.band) - rank(b.band) || b.timesAsked - a.timesAsked);
    out.set(k, list.slice(0, opts.perTopic ?? 8));
  }
  return out;
}

/** Per-topic counts and the topics the matrix lacks — the admin overview. */
export async function bankSummary(departmentId: string) {
  const [byTopic, proposed, totals, imports, matrix] = await Promise.all([
    prisma.interviewQuestion.groupBy({
      by: ["topicId", "kind"],
      where: { departmentId, hidden: false, topicId: { not: null } },
      _count: { _all: true },
      _sum: { timesAsked: true },
    }),
    prisma.interviewQuestion.groupBy({
      by: ["proposedTopic"],
      where: { departmentId, hidden: false, topicId: null, proposedTopic: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { proposedTopic: "desc" } },
      take: 40,
    }),
    prisma.interviewQuestion.groupBy({ by: ["kind", "hidden"], where: { departmentId }, _count: { _all: true } }),
    prisma.interviewQuestionImport.findMany({
      where: { departmentId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        stats: true,
        status: true,
        mapTotal: true,
        mapDone: true,
        error: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    loadTechMatrix(departmentId),
  ]);

  const counts = new Map<string, { theory: number; experience: number; other: number }>();
  for (const g of byTopic) {
    const c = counts.get(g.topicId!) ?? { theory: 0, experience: 0, other: 0 };
    if (g.kind === "THEORY") c.theory += g._count._all;
    else if (g.kind === "EXPERIENCE") c.experience += g._count._all;
    else c.other += g._count._all;
    counts.set(g.topicId!, c);
  }
  const topics = matrix.sections.flatMap((s) =>
    s.topics.map((t) => {
      const c = counts.get(t.id) ?? { theory: 0, experience: 0, other: 0 };
      return { id: t.id, title: t.title, sectionTitle: s.title, ...c, total: c.theory + c.experience + c.other };
    })
  );
  return {
    topics,
    proposed: proposed.map((p) => ({ title: p.proposedTopic!, count: p._count._all })),
    totals: totals.map((t) => ({ kind: t.kind, hidden: t.hidden, count: t._count._all })),
    imports,
  };
}

/** A skill is marked "often asked" on the matrix from this many asks. */
export const OFTEN_ASKED = 3;

/**
 * How often clients ask about each topic and each of its skills — the marks
 * on the matrix and roadmap. `asked` sums timesAsked of visible questions.
 */
export async function matrixInterviewStats(departmentId: string) {
  const [byTopic, bySkill] = await Promise.all([
    prisma.interviewQuestion.groupBy({
      by: ["topicId"],
      where: { departmentId, hidden: false, topicId: { not: null } },
      _count: { _all: true },
      _sum: { timesAsked: true },
    }),
    prisma.interviewQuestion.groupBy({
      by: ["topicId", "skill"],
      where: { departmentId, hidden: false, topicId: { not: null }, skill: { not: null } },
      _sum: { timesAsked: true },
    }),
  ]);
  const topics: Record<string, { questions: number; asked: number }> = {};
  for (const g of byTopic) topics[g.topicId!] = { questions: g._count._all, asked: g._sum.timesAsked ?? 0 };
  const skills: Record<string, Record<string, number>> = {};
  for (const g of bySkill) (skills[g.topicId!] ??= {})[g.skill!] = g._sum.timesAsked ?? 0;
  return { topics, skills, oftenAsked: OFTEN_ASKED };
}

/**
 * Skills the matrix lacks, as proposed by questions attached to a topic —
 * grouped per topic, most-asked first. The basis for "rewrite the matrix a bit".
 */
export async function suggestedSkills(departmentId: string, minAsked = 2) {
  const groups = await prisma.interviewQuestion.groupBy({
    by: ["topicId", "proposedSkill"],
    where: { departmentId, hidden: false, topicId: { not: null }, skill: null, proposedSkill: { not: null } },
    _count: { _all: true },
    _sum: { timesAsked: true },
  });
  const matrix = await loadTechMatrix(departmentId);
  const topicInfo = new Map(matrix.sections.flatMap((s) => s.topics.map((t) => [t.id, { title: t.title, sectionTitle: s.title }] as const)));
  const byTopic = new Map<string, Array<{ skill: string; questions: number; asked: number }>>();
  for (const g of groups) {
    if (!topicInfo.has(g.topicId!)) continue;
    const asked = g._sum.timesAsked ?? 0;
    if (asked < minAsked) continue;
    const list = byTopic.get(g.topicId!) ?? [];
    list.push({ skill: g.proposedSkill!, questions: g._count._all, asked });
    byTopic.set(g.topicId!, list);
  }
  return [...byTopic.entries()]
    .map(([topicId, list]) => ({ topicId, ...topicInfo.get(topicId)!, skills: list.sort((a, b) => b.asked - a.asked).slice(0, 8) }))
    .sort((a, b) => b.skills[0].asked - a.skills[0].asked);
}

/**
 * Add a proposed skill to a topic's band and re-point the questions that
 * proposed it, so they count towards the new skill's "often asked" mark.
 */
export async function acceptSuggestedSkill(topicId: string, band: (typeof BANDS)[number], skill: string, proposed: string) {
  await prisma.$transaction(async (tx) => {
    const topic = await tx.matrixTopic.findUniqueOrThrow({ where: { id: topicId } });
    const list = topic[band];
    if (!list.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      await tx.matrixTopic.update({ where: { id: topicId }, data: { [band]: [...list, skill] } });
    }
    await tx.interviewQuestion.updateMany({
      where: { topicId, proposedSkill: { equals: proposed, mode: "insensitive" } },
      data: { skill, proposedSkill: null },
    });
  });
}

/** Drop a suggestion without touching the matrix. */
export async function dismissSuggestedSkill(topicId: string, proposed: string) {
  await prisma.interviewQuestion.updateMany({
    where: { topicId, proposedSkill: { equals: proposed, mode: "insensitive" } },
    data: { proposedSkill: null },
  });
}
