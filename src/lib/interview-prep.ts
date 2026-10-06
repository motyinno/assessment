import { z } from "zod";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import { generateInterviewPrep } from "@/lib/ai-service";
import { loadTechMatrix } from "@/lib/data-loader";
import { resolveUserDivision } from "@/lib/user-division";
import { baseGrade, gradeLabel, nextGrade } from "@/lib/grades";
import type { TechMatrix } from "@/lib/types";

/**
 * Interview prep: AI-prepared questions an assessor takes into a session.
 *
 * The assessor picks topics (matrix topics of the subject's division, plus any
 * PDP topics the matrix doesn't cover); for each we gather what we know about
 * the candidate — previous assessment score, PDP membership, and, when filled,
 * the self-assessment — and ask the model for questions with answer key
 * points. Self-assessment is a weak signal on purpose: many people skip it, so
 * the matrix skills for the target grade are always the primary basis.
 */

export const PREP_LANGUAGES = ["ru", "en"] as const;
export type PrepLanguage = (typeof PREP_LANGUAGES)[number];

export const MAX_PREP_TOPICS = 15;

/** Section id for PDP topics that don't match any matrix topic. */
export const PDP_SECTION_ID = "__pdp__";

export type Band = "jun" | "mid" | "sen";

export interface TopicSignals {
  selfScore: number | null;
  selfComment: string | null;
  pastScore: number | null;
  pastComment: string | null;
  pastDate: string | null;
  inPdp: boolean;
  pdpQuestions: string[];
}

export interface PrepCandidateTopic {
  id: string;
  title: string;
  sectionId: string;
  sectionTitle: string;
  /** Matrix skills for the target band (or the PDP questions for PDP-only topics). */
  skills: string[];
  signals: TopicSignals;
}

export interface PrepCandidateSection {
  id: string;
  title: string;
  topics: PrepCandidateTopic[];
}

export type PrepReason = "self_check" | "past_gap" | "pdp" | "coverage";

export interface PrepQuestion {
  id: string;
  text: string;
  level: Band;
  reason: PrepReason;
  keyPoints: string[];
  redFlags: string[];
  followUp: string | null;
  asked: boolean;
}

export interface PrepTask {
  title: string;
  description: string;
  expectations: string[];
}

export interface PrepTopic {
  topicId: string;
  title: string;
  sectionTitle: string;
  questions: PrepQuestion[];
  task: PrepTask | null;
}

export interface InterviewPrepContent {
  focus: string;
  topics: PrepTopic[];
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/interview-prep.test.ts)
// ---------------------------------------------------------------------------

/**
 * The grade the interview is for. `Assessment.grade` is the subject's grade at
 * request time, so the target is one step up; legacy imports already store the
 * target (see assessmentTargetGrade in lib/grades.ts).
 */
export function prepTargetGrade(assessment: { id: string; grade: string }): string {
  if (assessment.id.startsWith("legacy_")) return assessment.grade;
  return nextGrade(assessment.grade) ?? assessment.grade;
}

/**
 * `AssessmentParticipant.assignedSections` is stored both as a JSON-encoded
 * string and as a native array depending on the writer; accept either.
 */
export function parseAssignedSections(raw: unknown): string[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * `Pdp.topicsJson` has had several shapes over time: an array of topic names,
 * an array of `{ category, questions, practicalTask }`, or a JSON string of
 * either. Normalize to `{ title, questions }`.
 */
export function parsePdpTopics(raw: unknown): Array<{ title: string; questions: string[] }> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value) && "pdpTopics" in value) {
    value = (value as { pdpTopics: unknown }).pdpTopics;
  }
  if (!Array.isArray(value)) return [];
  const out: Array<{ title: string; questions: string[] }> = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push({ title: item.trim(), questions: [] });
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const title = typeof o.category === "string" ? o.category : typeof o.name === "string" ? o.name : null;
      if (!title?.trim()) continue;
      const questions = Array.isArray(o.questions)
        ? o.questions.filter((q): q is string => typeof q === "string")
        : [];
      out.push({ title: title.trim(), questions });
    }
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase();

const emptySignals = (): TopicSignals => ({
  selfScore: null,
  selfComment: null,
  pastScore: null,
  pastComment: null,
  pastDate: null,
  inPdp: false,
  pdpQuestions: [],
});

/**
 * Join the matrix with what we know about the candidate. Previous results are
 * keyed by topic id (current writes) or topic title (legacy imports) and must
 * be passed newest first — the first hit per topic wins.
 */
export function buildCandidateSections(input: {
  matrix: TechMatrix;
  band: Band;
  selfAssessments: Array<{ topicId: string; score: number | null; comment: string | null }>;
  pastResults: Array<{ category: string; score: number | null; comment: string | null; date: Date }>;
  pdpTopics: Array<{ title: string; questions: string[] }>;
}): PrepCandidateSection[] {
  const { matrix, band, selfAssessments, pastResults, pdpTopics } = input;

  const selfByTopic = new Map(selfAssessments.map((s) => [s.topicId, s]));
  const pastByKey = new Map<string, (typeof pastResults)[number]>();
  for (const r of pastResults) {
    if (r.score === null && !r.comment) continue;
    const key = norm(r.category);
    if (!pastByKey.has(key)) pastByKey.set(key, r);
  }
  const pdpByTitle = new Map(pdpTopics.map((p) => [norm(p.title), p]));
  const matchedPdp = new Set<string>();

  const sections: PrepCandidateSection[] = matrix.sections.map((section) => ({
    id: section.id,
    title: section.title,
    topics: section.topics.map((topic) => {
      const signals = emptySignals();
      const self = selfByTopic.get(topic.id);
      if (self) {
        signals.selfScore = self.score;
        signals.selfComment = self.comment || null;
      }
      const past = pastByKey.get(norm(topic.id)) ?? pastByKey.get(norm(topic.title));
      if (past) {
        signals.pastScore = past.score;
        signals.pastComment = past.comment || null;
        signals.pastDate = past.date.toISOString();
      }
      const pdp = pdpByTitle.get(norm(topic.title));
      if (pdp) {
        signals.inPdp = true;
        signals.pdpQuestions = pdp.questions;
        matchedPdp.add(norm(pdp.title));
      }
      return {
        id: topic.id,
        title: topic.title,
        sectionId: section.id,
        sectionTitle: section.title,
        skills: topic[band] ?? [],
        signals,
      };
    }),
  }));

  // PDP topics outside the matrix (mentor-requested technologies) still need
  // checking, especially on a PDP review — surface them as their own group.
  const extra = pdpTopics.filter((p) => !matchedPdp.has(norm(p.title)));
  if (extra.length > 0) {
    sections.push({
      id: PDP_SECTION_ID,
      title: "PDP",
      topics: extra.map((p, i) => ({
        id: `pdp:${i}`,
        title: p.title,
        sectionId: PDP_SECTION_ID,
        sectionTitle: "PDP",
        skills: p.questions,
        signals: { ...emptySignals(), inPdp: true, pdpQuestions: p.questions },
      })),
    });
  }

  return sections.filter((s) => s.topics.length > 0);
}

/** A previous score at or below this counts as a gap worth re-checking. */
const GAP_THRESHOLD = 6;

/**
 * Which topics the picker starts with ticked. The assessor always has the last
 * word; this only saves clicks:
 * - PDP review → every PDP topic.
 * - Assessor with assigned sections → those sections.
 * - Otherwise → previous gaps and PDP topics, if any.
 */
export function defaultTopicSelection(
  sections: PrepCandidateSection[],
  opts: { assessmentType: string; assignedSections: string[] }
): string[] {
  const all = sections.flatMap((s) => s.topics);
  let picked: PrepCandidateTopic[];
  if (opts.assessmentType === "PDP_CHECK") {
    picked = all.filter((t) => t.signals.inPdp);
  } else if (opts.assignedSections.length > 0) {
    const assigned = new Set(opts.assignedSections);
    picked = all.filter((t) => assigned.has(t.sectionId));
  } else {
    picked = all.filter(
      (t) => t.signals.inPdp || (t.signals.pastScore !== null && t.signals.pastScore <= GAP_THRESHOLD)
    );
  }
  return picked.slice(0, MAX_PREP_TOPICS).map((t) => t.id);
}

// ---------------------------------------------------------------------------
// AI output normalization
// ---------------------------------------------------------------------------

const str = z.string().trim();
const strList = z
  .array(z.unknown())
  .catch([])
  .transform((xs) => xs.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()));

const aiQuestionSchema = z.object({
  text: str.min(1),
  level: z.enum(["jun", "mid", "sen"]).catch("mid"),
  reason: z.enum(["self_check", "past_gap", "pdp", "coverage"]).catch("coverage"),
  keyPoints: strList,
  redFlags: strList,
  followUp: z.string().trim().nullish().catch(null),
});

const aiTaskSchema = z.object({
  title: str.min(1),
  description: str.min(1),
  expectations: strList,
});

const aiTopicSchema = z.object({
  topicId: z.string(),
  questions: z.array(z.unknown()).catch([]),
  task: z.unknown().optional(),
});

export const aiPrepSchema = z.object({
  focus: z.string().catch(""),
  topics: z.array(z.unknown()).catch([]),
});

let idCounter = 0;
function questionId(): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `q_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

function parseQuestions(raw: unknown[]): PrepQuestion[] {
  const out: PrepQuestion[] = [];
  for (const q of raw) {
    const parsed = aiQuestionSchema.safeParse(q);
    if (!parsed.success) continue;
    out.push({
      id: questionId(),
      text: parsed.data.text,
      level: parsed.data.level,
      reason: parsed.data.reason,
      keyPoints: parsed.data.keyPoints,
      redFlags: parsed.data.redFlags,
      followUp: parsed.data.followUp || null,
      asked: false,
    });
  }
  return out;
}

function parseTask(raw: unknown): PrepTask | null {
  const parsed = aiTaskSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Turn the model's JSON into stored content. Topics the model invented (ids we
 * didn't send) are dropped; titles come from our side, not the model's.
 */
export function normalizeAiPrep(raw: unknown, requested: PrepCandidateTopic[]): InterviewPrepContent {
  const top = aiPrepSchema.parse(raw ?? {});
  const byId = new Map(requested.map((t) => [t.id, t]));
  const topics: PrepTopic[] = [];
  for (const item of top.topics) {
    const parsed = aiTopicSchema.safeParse(item);
    if (!parsed.success) continue;
    const source = byId.get(parsed.data.topicId);
    if (!source || topics.some((t) => t.topicId === source.id)) continue;
    const questions = parseQuestions(parsed.data.questions);
    if (questions.length === 0) continue;
    topics.push({
      topicId: source.id,
      title: source.title,
      sectionTitle: source.sectionTitle,
      questions,
      task: parseTask(parsed.data.task),
    });
  }
  // Keep the picker's order rather than whatever order the model chose.
  const order = new Map(requested.map((t, i) => [t.id, i]));
  topics.sort((a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0));
  return { focus: top.focus.trim(), topics };
}

/** Questions from a single-topic "more questions" call. */
export function normalizeAiMoreQuestions(raw: unknown): PrepQuestion[] {
  const parsed = z.object({ questions: z.array(z.unknown()).catch([]) }).safeParse(raw ?? {});
  return parsed.success ? parseQuestions(parsed.data.questions) : [];
}

/** Task from a single-topic "practical task" call. */
export function normalizeAiTask(raw: unknown): PrepTask | null {
  const parsed = z.object({ task: z.unknown() }).safeParse(raw ?? {});
  return parsed.success ? parseTask(parsed.data.task) : null;
}

/** Stored content is our own JSON, but guard against shape drift. */
export function readPrepContent(raw: unknown): InterviewPrepContent {
  const value = raw as Partial<InterviewPrepContent> | null;
  return {
    focus: typeof value?.focus === "string" ? value.focus : "",
    topics: Array.isArray(value?.topics) ? value.topics : [],
  };
}

// ---------------------------------------------------------------------------
// DB loading
// ---------------------------------------------------------------------------

export interface PrepContext {
  assessment: { id: string; grade: string; assessmentType: string; status: string };
  targetGrade: string;
  targetGradeLabel: string;
  band: Band;
  sections: PrepCandidateSection[];
  defaultTopicIds: string[];
}

/**
 * Everything the picker and the generator need, for one assessor. Returns null
 * when the assessment or its subject is missing.
 */
export async function loadPrepContext(assessmentId: string, assessorId: string): Promise<PrepContext | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      grade: true,
      assessmentType: true,
      status: true,
      participants: { select: { userId: true, participantRole: true, assignedSections: true } },
    },
  });
  if (!assessment) return null;
  const subjectId = assessment.participants.find((p) => p.participantRole === "SUBJECT")?.userId;
  if (!subjectId) return null;
  const me = assessment.participants.find((p) => p.participantRole === "ASSESSOR" && p.userId === assessorId);

  const targetGrade = prepTargetGrade(assessment);
  const band = baseGrade(targetGrade);

  // The subject's division decides the matrix — not the assessor's.
  const division = await resolveUserDivision(subjectId);
  const [matrix, selfAssessments, pastResults, pdps] = await Promise.all([
    division ? loadTechMatrix(division.id) : Promise.resolve<TechMatrix>({ sections: [] }),
    prisma.selfAssessment.findMany({
      where: { assessmentId },
      select: { topicId: true, score: true, comment: true },
    }),
    prisma.assessmentResult.findMany({
      where: {
        assessmentId: { not: assessmentId },
        assessment: {
          status: "COMPLETED",
          participants: { some: { userId: subjectId, participantRole: "SUBJECT" } },
        },
      },
      select: {
        category: true,
        score: true,
        comment: true,
        assessment: { select: { completedAt: true, createdAt: true } },
      },
      orderBy: [{ assessment: { completedAt: "desc" } }, { createdAt: "desc" }],
    }),
    // Only plans the employee actually has: drafts are still the manager's.
    prisma.pdp.findMany({
      where: { userId: subjectId, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        status: true,
        topicsJson: true,
        goals: {
          orderBy: { order: "asc" },
          select: { title: true, items: { where: { type: "THEORY" }, orderBy: { order: "asc" }, select: { text: true } } },
        },
      },
    }),
  ]);
  // The PDP being worked on: the newest ACTIVE one, else simply the newest.
  const pdp = pdps.find((p) => p.status === "ACTIVE") ?? pdps[0];
  // Builder plans keep topics as goals; older plans only have topicsJson.
  const pdpTopics = pdp?.goals.length
    ? pdp.goals.map((g) => ({ title: g.title, questions: g.items.map((i) => i.text) }))
    : parsePdpTopics(pdp?.topicsJson);

  const sections = buildCandidateSections({
    matrix,
    band,
    selfAssessments,
    pastResults: pastResults.map((r) => ({
      category: r.category,
      score: r.score,
      comment: r.comment,
      date: r.assessment.completedAt ?? r.assessment.createdAt,
    })),
    pdpTopics,
  });

  return {
    assessment: {
      id: assessment.id,
      grade: assessment.grade,
      assessmentType: assessment.assessmentType,
      status: assessment.status,
    },
    targetGrade,
    targetGradeLabel: gradeLabel(targetGrade),
    band,
    sections,
    defaultTopicIds: defaultTopicSelection(sections, {
      assessmentType: assessment.assessmentType,
      assignedSections: parseAssignedSections(me?.assignedSections),
    }),
  };
}

export function findCandidateTopics(sections: PrepCandidateSection[], ids: string[]): PrepCandidateTopic[] {
  const byId = new Map(sections.flatMap((s) => s.topics).map((t) => [t.id, t]));
  return ids.map((id) => byId.get(id)).filter((t): t is PrepCandidateTopic => !!t);
}

// ---------------------------------------------------------------------------
// Incremental, background generation
// ---------------------------------------------------------------------------

/**
 * Split a new topic selection against what's already prepared: topics that
 * stay keep their questions (and "asked" ticks), dropped ones go, and only the
 * new ones need the model. Switching language invalidates everything.
 */
export function planPrepUpdate(
  existing: { language: string; content: InterviewPrepContent } | null,
  selectedIds: string[],
  language: PrepLanguage
): { kept: PrepTopic[]; toGenerate: string[] } {
  const reusable = existing && existing.language === language ? existing.content.topics : [];
  const byId = new Map(reusable.map((t) => [t.topicId, t]));
  return {
    kept: selectedIds.map((id) => byId.get(id)).filter((t): t is PrepTopic => !!t),
    toGenerate: selectedIds.filter((id) => !byId.has(id)),
  };
}

/** Order topics by the selection order (the matrix order the picker sends). */
export function orderTopics(topics: PrepTopic[], topicIds: string[]): PrepTopic[] {
  const order = new Map(topicIds.map((id, i) => [id, i]));
  return [...topics].sort(
    (a, b) => (order.get(a.topicId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.topicId) ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * A generation that hasn't finished in this long is treated as failed — the
 * job is fire-and-forget, so a server restart mid-call would otherwise leave
 * the card spinning forever.
 */
export const PREP_STALE_MS = 5 * 60_000;

export type PrepStatus = "READY" | "GENERATING" | "FAILED";

export function effectivePrepStatus(row: {
  status: string;
  generationStartedAt: Date | null;
}): PrepStatus {
  if (row.status === "GENERATING") {
    const started = row.generationStartedAt?.getTime() ?? 0;
    return Date.now() - started > PREP_STALE_MS ? "FAILED" : "GENERATING";
  }
  return row.status === "FAILED" ? "FAILED" : "READY";
}

/** API shape of a stored prep row. */
export function serializePrep(row: {
  language: string;
  topicIds: string[];
  content: unknown;
  status: string;
  error: string | null;
  pendingTopicIds: string[];
  generationStartedAt: Date | null;
  updatedAt: Date;
}) {
  const status = effectivePrepStatus(row);
  return {
    language: row.language === "en" ? "en" : "ru",
    topicIds: row.topicIds,
    content: readPrepContent(row.content),
    status,
    error: status === "FAILED" ? row.error ?? "Generation took too long. Try again." : null,
    pendingTopicIds: status === "READY" ? [] : row.pendingTopicIds,
    updatedAt: row.updatedAt,
  };
}

/**
 * Background job: generate questions for `topicIds` and merge them into the
 * prep row. Never throws — failures land on the row as FAILED. Writes are
 * conditional on `generationId`, so a superseded job (or one whose prep was
 * deleted because the assessment finished) writes nothing.
 */
export async function runPrepGeneration(opts: {
  prepId: string;
  generationId: string;
  assessmentId: string;
  assessorId: string;
  topicIds: string[];
  language: PrepLanguage;
}): Promise<void> {
  const { prepId, generationId } = opts;
  const current = { id: prepId, generationId };
  try {
    const ctx = await loadPrepContext(opts.assessmentId, opts.assessorId);
    if (!ctx) throw new Error("Assessment or its subject not found");
    const topics = findCandidateTopics(ctx.sections, opts.topicIds);
    if (topics.length === 0) throw new Error("None of the selected topics exist in the matrix");

    const before = await prisma.interviewPrep.findFirst({ where: current });
    if (!before) return;
    const keptTitles = readPrepContent(before.content).topics.map((t) => t.title);

    const raw = await generateInterviewPrep({
      targetGradeLabel: ctx.targetGradeLabel,
      band: ctx.band,
      assessmentType: ctx.assessment.assessmentType,
      language: opts.language,
      topics,
      alreadyPrepared: keptTitles,
    });
    const generated = normalizeAiPrep(raw, topics);
    if (generated.topics.length === 0) throw new Error("The model returned no usable questions");

    // Re-read: "asked" ticks and per-topic extras may have changed meanwhile.
    const latest = await prisma.interviewPrep.findFirst({ where: current });
    if (!latest) return;
    const content = readPrepContent(latest.content);
    const merged: InterviewPrepContent = {
      focus: generated.focus || content.focus,
      topics: orderTopics(
        [...content.topics.filter((t) => !generated.topics.some((g) => g.topicId === t.topicId)), ...generated.topics],
        latest.topicIds
      ),
    };
    const missing = topics.filter((t) => !generated.topics.some((g) => g.topicId === t.id));
    await prisma.interviewPrep.updateMany({
      where: current,
      data: {
        content: merged as unknown as Prisma.InputJsonValue,
        status: missing.length ? "FAILED" : "READY",
        error: missing.length ? `No questions came back for: ${missing.map((t) => t.title).join(", ")}` : null,
        pendingTopicIds: missing.map((t) => t.id),
      },
    });
  } catch (e) {
    log.error("Interview prep generation failed", {
      assessmentId: opts.assessmentId,
      error: e instanceof Error ? e.message : String(e),
    });
    await prisma.interviewPrep
      .updateMany({
        where: current,
        data: { status: "FAILED", error: "Couldn't generate questions. Try again in a minute." },
      })
      .catch(() => {});
  }
}

/**
 * Interview questions only matter until the interview is over: drop every
 * assessor's prep once the assessment completes or is cancelled. Accepts a
 * transaction client so it commits together with the status change.
 */
export async function deleteInterviewPreps(
  db: Pick<Prisma.TransactionClient, "interviewPrep">,
  assessmentId: string
): Promise<void> {
  await db.interviewPrep.deleteMany({ where: { assessmentId } });
}
