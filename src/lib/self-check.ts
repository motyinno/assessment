import { z } from "zod";

/**
 * "Check yourself" on a PDP goal: a short AI quiz the employee takes on their
 * own. Multiple-choice questions are graded here; open questions are graded
 * by the AI (lib/ai-service gradeSelfCheckOpen). Results are private to the
 * employee and never move roadmap readiness by themselves — a passed check
 * only *offers* to tick the roadmap skills it covered.
 * Client-safe: no prisma.
 */

/** Score (0–100) at which a check counts as passed. */
export const SELF_CHECK_PASS = 70;

export const SELF_CHECK_LANGUAGES = ["ru", "en"] as const;
export type SelfCheckLanguage = (typeof SELF_CHECK_LANGUAGES)[number];

export interface ChoiceQuestion {
  id: string;
  kind: "choice";
  text: string;
  options: string[];
  /** Index into options. Never sent to the client before submit. */
  correct: number;
  /** Why the right option is right. Never sent before submit. */
  explanation: string;
  /** The roadmap skill (exact matrix string) this question checks, if any. */
  skill: string | null;
}

export interface OpenQuestion {
  id: string;
  kind: "open";
  text: string;
  /** What a good answer covers — the grading rubric. Never sent before submit. */
  keyPoints: string[];
  skill: string | null;
}

export type SelfCheckQuestion = ChoiceQuestion | OpenQuestion;

/** A question as the employee sees it while answering. */
export type PublicQuestion =
  | Omit<ChoiceQuestion, "correct" | "explanation">
  | Omit<OpenQuestion, "keyPoints">;

export interface SelfCheckAnswer {
  questionId: string;
  choice?: number;
  text?: string;
}

export type Verdict = "correct" | "partial" | "wrong";

export interface SelfCheckVerdict {
  questionId: string;
  verdict: Verdict;
  feedback: string;
}

// ── AI output ────────────────────────────────────────────────────────────────

const generatedSchema = z.object({
  questions: z.array(
    z.union([
      z.object({
        kind: z.literal("choice"),
        text: z.string().trim().min(1),
        options: z.array(z.string().trim().min(1)).min(3).max(5),
        correct: z.number().int().min(0),
        explanation: z.string().trim().default(""),
        skill: z.string().nullish(),
      }),
      z.object({
        kind: z.literal("open"),
        text: z.string().trim().min(1),
        keyPoints: z.array(z.string().trim().min(1)).min(1),
        skill: z.string().nullish(),
      }),
    ])
  ),
});

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Validate the AI's questions. Malformed ones are dropped rather than failing
 * the whole check; a skill tag survives only if it names one of `skills`
 * (matched loosely, stored exactly), so roadmap ticks never get invented strings.
 */
export function parseGeneratedQuestions(raw: unknown, skills: string[]): SelfCheckQuestion[] {
  const items = (raw as { questions?: unknown })?.questions;
  if (!Array.isArray(items)) throw new Error("The AI returned no questions");
  const bySkill = new Map(skills.map((s) => [norm(s), s]));
  const out: SelfCheckQuestion[] = [];
  for (const item of items) {
    const parsed = generatedSchema.shape.questions.element.safeParse(item);
    if (!parsed.success) continue;
    const q = parsed.data;
    const skill = (q.skill && bySkill.get(norm(q.skill))) || null;
    const id = `q${out.length + 1}`;
    if (q.kind === "choice") {
      if (q.correct >= q.options.length) continue;
      out.push({ id, kind: "choice", text: q.text, options: q.options, correct: q.correct, explanation: q.explanation, skill });
    } else {
      out.push({ id, kind: "open", text: q.text, keyPoints: q.keyPoints, skill });
    }
  }
  if (out.length < 3) throw new Error("The AI returned too few usable questions");
  return out;
}

const verdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      questionId: z.string(),
      verdict: z.enum(["correct", "partial", "wrong"]),
      feedback: z.string().default(""),
    })
  ),
});

/** Validate the AI's grading of open answers; missing ones count as wrong. */
export function parseOpenVerdicts(raw: unknown, openIds: string[]): SelfCheckVerdict[] {
  const parsed = verdictsSchema.safeParse(raw);
  const got = new Map((parsed.success ? parsed.data.verdicts : []).map((v) => [v.questionId, v]));
  return openIds.map(
    (id) => got.get(id) ?? { questionId: id, verdict: "wrong", feedback: "Couldn't grade this answer." }
  );
}

// ── Grading ──────────────────────────────────────────────────────────────────

export function publicQuestions(questions: SelfCheckQuestion[]): PublicQuestion[] {
  return questions.map((q) =>
    q.kind === "choice"
      ? { id: q.id, kind: q.kind, text: q.text, options: q.options, skill: q.skill }
      : { id: q.id, kind: q.kind, text: q.text, skill: q.skill }
  );
}

export const answersSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().max(20),
        choice: z.number().int().min(0).max(10).optional(),
        text: z.string().max(4000).optional(),
      })
    )
    .max(20),
});

/** Grade the multiple-choice questions; open ones are left to the AI. */
export function gradeChoices(questions: SelfCheckQuestion[], answers: SelfCheckAnswer[]): SelfCheckVerdict[] {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  return questions
    .filter((q): q is ChoiceQuestion => q.kind === "choice")
    .map((q) => ({
      questionId: q.id,
      verdict: byId.get(q.id)?.choice === q.correct ? "correct" : "wrong",
      feedback: q.explanation,
    }));
}

/** Open questions answered with something worth sending to the AI. */
export function answeredOpen(questions: SelfCheckQuestion[], answers: SelfCheckAnswer[]) {
  const byId = new Map(answers.map((a) => [a.questionId, a.text?.trim() ?? ""]));
  const open = questions.filter((q): q is OpenQuestion => q.kind === "open");
  return {
    toGrade: open.filter((q) => byId.get(q.id)).map((q) => ({ question: q, answer: byId.get(q.id)! })),
    blank: open
      .filter((q) => !byId.get(q.id))
      .map((q): SelfCheckVerdict => ({ questionId: q.id, verdict: "wrong", feedback: "No answer given." })),
  };
}

/** Verdicts in question order. */
export function orderVerdicts(questions: SelfCheckQuestion[], verdicts: SelfCheckVerdict[]): SelfCheckVerdict[] {
  const byId = new Map(verdicts.map((v) => [v.questionId, v]));
  return questions.map((q) => byId.get(q.id) ?? { questionId: q.id, verdict: "wrong", feedback: "" });
}

const WEIGHT: Record<Verdict, number> = { correct: 1, partial: 0.5, wrong: 0 };

export function scoreOf(verdicts: SelfCheckVerdict[]): number {
  if (!verdicts.length) return 0;
  return Math.round((verdicts.reduce((s, v) => s + WEIGHT[v.verdict], 0) / verdicts.length) * 100);
}

/**
 * Roadmap skills a check may offer to tick: those of questions answered
 * correctly, not yet ticked — and only once the check is passed.
 */
export function skillsToTick(
  questions: SelfCheckQuestion[],
  verdicts: SelfCheckVerdict[],
  alreadyResolved: string[]
): string[] {
  if (scoreOf(verdicts) < SELF_CHECK_PASS) return [];
  const right = new Set(verdicts.filter((v) => v.verdict === "correct").map((v) => v.questionId));
  const done = new Set(alreadyResolved);
  const out: string[] = [];
  for (const q of questions) {
    if (q.skill && right.has(q.id) && !done.has(q.skill) && !out.includes(q.skill)) out.push(q.skill);
  }
  return out;
}

/** What the API returns for one attempt. Before submit, questions are public only. */
export interface SelfCheckView {
  id: string;
  language: SelfCheckLanguage;
  createdAt: string;
  submittedAt: string | null;
  score: number | null;
  passed: boolean;
  questions: Array<PublicQuestion | SelfCheckQuestion>;
  answers: SelfCheckAnswer[] | null;
  verdicts: SelfCheckVerdict[] | null;
  /** Roadmap skills this passed check offers to tick. */
  toTick: string[];
}
