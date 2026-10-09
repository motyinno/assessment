import { normalizeCategory, ensureCategoryMapping } from "./category-mapper";
import type { PrepCandidateTopic } from "./interview-prep";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Overridable via env so a model can be swapped without a code change or
// rebuild. OpenRouter tries the fallback if the primary is down or rate-limited.
const AI_MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-5.5";
const AI_FALLBACK_MODEL = process.env.OPENROUTER_FALLBACK_MODEL || "qwen/qwen3.7-plus";

const AI_TIMEOUT_MS = 60_000;
const AI_MAX_TOKENS = 8000;

class AIRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/** Models sometimes wrap JSON in ``` fences despite json mode; strip them. */
function parseJsonResponse(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

/**
 * One JSON-mode chat completion through OpenRouter. Returns the parsed JSON.
 * Errors carry the HTTP status so withAIRetry can tell transient ones apart.
 */
async function callAI(opts: {
  system: string;
  prompt: string;
  temperature: number;
}): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new AIRequestError("OPENROUTER_API_KEY is not set");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "PDP Generator",
    },
    body: JSON.stringify({
      models: [AI_MODEL, AI_FALLBACK_MODEL],
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature,
      max_tokens: AI_MAX_TOKENS,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AIRequestError(`OpenRouter ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    error?: { message?: string; code?: number };
  };
  // OpenRouter can return 200 with an error body when a provider fails mid-way.
  if (data.error) throw new AIRequestError(`OpenRouter: ${data.error.message ?? "error"}`, data.error.code);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AIRequestError("No response content from the AI model");
  return parseJsonResponse(text);
}

/**
 * Retry an AI call through transient errors (503 overloaded, 429 rate limit,
 * 500, timeouts) with exponential backoff. Non-transient errors are re-thrown
 * immediately.
 */
async function withAIRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 800
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number })?.status;
      const transient =
        status === 503 ||
        status === 502 ||
        status === 429 ||
        status === 500 ||
        /50\d|overloaded|high demand|unavailable|rate limit|fetch failed|ECONNRESET|ETIMEDOUT|TimeoutError|aborted/i.test(String(e));
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw lastError;
}

export interface AssessmentResult {
  category: string;
  score: number | null;
  comment: string;
  subtopics: string[];
}

export interface AIGeneratedFeedback {
  feedback: Array<{
    category: string;
    feedback: string;
  }>;
}

export interface AIGeneratedPDPTopics {
  pdpTopics: Array<{
    category: string;
    questions: string[];
    practicalTask: string;
  }>;
}

export interface TechMatrixTopicInput {
  title: string;
  skills: string[];
  // Mentor-requested technology that MUST appear in the PDP, even if it isn't
  // part of the grade matrix.
  priority?: boolean;
  // From the assessment the PDP is based on, when there is one.
  previousScore?: number | null;
  assessorComment?: string | null;
}

export interface DailyTopicResource {
  label: string;
  url: string;
}

export interface AIGeneratedDailyTopic {
  kind: "concept" | "problem";
  title: string;
  category: string;
  summary: string;
  detail: string;
  code: string | null;
  resources: DailyTopicResource[];
}

/**
 * Generate a "Topic of the day" for the dashboard: an evergreen, interesting
 * programming concept or a small problem with its solution — plus a few
 * reputable resources. Not tied to the tech matrix.
 *
 * @param kind        "concept" | "problem" — which flavour to produce.
 * @param avoidTitles recent titles to steer away from, reducing repeats.
 */
export async function generateDailyTopic(
  kind: "concept" | "problem",
  avoidTitles: string[] = []
): Promise<AIGeneratedDailyTopic> {
  const avoidLine = avoidTitles.length
    ? `Avoid these recently used topics (pick something clearly different): ${avoidTitles.join("; ")}.`
    : "";

  const flavour =
    kind === "problem"
      ? `Produce a small, interesting PROBLEM with its solution. In "detail": state the problem clearly first, then walk through the solution and the key insight. Keep it approachable but non-trivial.`
      : `Produce an interesting CONCEPT explainer. In "detail": explain what it is, why it matters, and when to use it, with a concrete example. Keep it concise but substantial.`;

  const prompt = `You are curating a daily "Topic of the day" for a team of software engineers.

${flavour}
Pick something genuinely interesting from ANY area of software engineering (algorithms, data structures, language internals, design patterns, databases, concurrency, networking, performance, security, tooling, etc.). Vary the difficulty day to day. It must be evergreen and factually correct — do NOT invent news, dates, or statistics.
${avoidLine}

Respond ONLY with valid JSON in exactly this shape:
{
  "kind": "${kind}",
  "title": "Short, catchy title",
  "category": "One or two word tag, e.g. Algorithms, JavaScript, Databases, Concurrency",
  "summary": "1-2 sentence hook that makes someone want to read on",
  "detail": "2-4 short paragraphs. Use plain text; separate paragraphs with a blank line. No markdown headers.",
  "code": "OPTIONAL short illustrative snippet (max ~18 lines), plain code with NO markdown fences; use null if not helpful",
  "resources": [
    { "label": "Human-readable source name, e.g. 'MDN: Event loop'", "url": "https://..." }
  ]
}

Rules for resources: 2-3 items. Only link to well-known, canonical, stable sources (MDN, official language/framework docs, Wikipedia, well-known references). Never invent URLs — if unsure of an exact URL, link to the site's stable root/section rather than a guessed deep link. All text in ENGLISH.`;

  try {
    const parsed = (await withAIRetry(() =>
      callAI({
        system: "You are a precise technical writer. Always respond with valid JSON only.",
        prompt,
        temperature: 0.9,
      })
    )) as AIGeneratedDailyTopic;
    // Normalize/guard the fields we depend on.
    parsed.kind = parsed.kind === "problem" ? "problem" : "concept";
    parsed.code = parsed.code && parsed.code.trim() ? parsed.code : null;
    parsed.resources = Array.isArray(parsed.resources)
      ? parsed.resources
          .filter(
            (r) =>
              r &&
              typeof r.url === "string" &&
              /^https?:\/\//i.test(r.url) &&
              typeof r.label === "string"
          )
          .slice(0, 3)
      : [];
    return parsed;
  } catch (error) {
    console.error("Error generating daily topic:", error);
    throw new Error("Failed to generate the topic of the day.");
  }
}

/**
 * Generate detailed feedback for each category based on assessment results
 */
export async function generateFeedback(
  results: AssessmentResult[],
  employeeName: string,
  grade: string,
  departmentId: string | null
): Promise<AIGeneratedFeedback> {
  // Prepare the assessment data for AI
  const assessmentData = results
    .map((r) => {
      return `- ${r.category}: Score ${r.score !== null ? r.score : "N/A"}/10. Comment: ${r.comment || "No comment"}. Subtopics: ${r.subtopics.join(", ") || "None"}`;
    })
    .join("\n");

  const prompt = `You are an expert technical assessor providing feedback for an employee.

Employee Name: ${employeeName}
Grade: ${grade}

Assessment Results:
${assessmentData}

Please generate detailed feedback for each category. Focus on:
- Strengths and areas for improvement
- Specific recommendations for growth
- Actionable advice

IMPORTANT: All feedback must be in ENGLISH language.

Format your response as JSON with this structure:
{
  "feedback": [
    {
      "category": "Category Name",
      "feedback": "Detailed feedback text for this category"
    }
  ]
}

Use the EXACT same category name as shown in the Assessment Results above (maintain the original capitalization and formatting). Respond ONLY with valid JSON, no other text.`;

  try {
    const parsed = (await withAIRetry(() =>
      callAI({
        system:
          "You are an expert technical assessor and mentor. You provide constructive, actionable feedback. Always respond with valid JSON only.",
        prompt,
        temperature: 0.7,
      })
    )) as AIGeneratedFeedback;
    console.log("AI Feedback Response:", JSON.stringify(parsed, null, 2));

    // Normalize category names to match tech matrix titles
    if (departmentId) await ensureCategoryMapping(departmentId);
    parsed.feedback = parsed.feedback.map((item) => ({
      ...item,
      category: departmentId ? normalizeCategory(item.category, departmentId) : item.category,
    }));

    return parsed;
  } catch (error) {
    console.error("Error generating AI feedback:", error);
    throw new Error("Failed to generate AI feedback. Please try again in a moment.");
  }
}

/**
 * Generate PDP content for a set of tech-matrix topics chosen for the user's
 * grade, without reference to a completed assessment. Returns one practical
 * task + a small set of study questions per topic.
 */
export async function generateStandalonePDP(
  topics: TechMatrixTopicInput[],
  employeeName: string,
  grade: string,
  departmentId: string | null
): Promise<AIGeneratedPDPTopics> {
  if (topics.length === 0) {
    return { pdpTopics: [] };
  }
  // Local development only: skip the AI call.
  if (process.env.AI_MOCK === "true") {
    return {
      pdpTopics: topics.map((t) => ({
        category: t.title,
        questions: [`[mock] How does ${t.title} work under the hood?`, `[mock] When would you not use ${t.title}?`],
        practicalTask: `[mock] Build a small project that uses ${t.title} and explain the trade-offs.`,
      })),
    };
  }

  const formatTopic = (t: TechMatrixTopicInput) => {
    let line = `- ${t.title} (grade-relevant skills: ${t.skills.length ? t.skills.join("; ") : "general fundamentals"})`;
    if (t.previousScore != null || t.assessorComment) {
      line += `\n  assessment result: ${t.previousScore ?? "n/a"}/10${t.assessorComment ? `, assessor's comment: "${t.assessorComment}"` : ""} — target the gaps this reveals`;
    }
    return line;
  };

  const matrixTopics = topics.filter((t) => !t.priority);
  const priorityTopics = topics.filter((t) => t.priority);

  const matrixList = matrixTopics.length
    ? matrixTopics.map(formatTopic).join("\n")
    : "(none)";

  const prioritySection = priorityTopics.length
    ? `

PRIORITY technologies the mentor specifically requested. You MUST include EACH of
these as its own topic in the output — do not skip, rename, or merge them, even if
they are not part of the technical matrix. Target them at the ${grade} grade:
${priorityTopics.map(formatTopic).join("\n")}`
    : "";

  const prompt = `You are an expert technical mentor preparing a Professional Development Plan (PDP) for an employee.

Employee Name: ${employeeName}
Grade: ${grade}

Topics to cover (from the ${grade}-grade technical matrix):
${matrixList}${prioritySection}

For each topic, produce:
- 2-3 concise study questions the employee should learn/research to master the topic at their grade
- EXACTLY ONE practical task that demonstrates mastery of the topic

Target each item at the stated grade — not too easy, not beyond scope.

IMPORTANT:
- All questions and practical tasks MUST be in ENGLISH.
- Use the EXACT same topic title as in the list above — preserve capitalization and spacing (e.g. "TypeScript Fundamentals", not "typescript-fundamentals").

Respond ONLY with valid JSON:
{
  "pdpTopics": [
    { "category": "Topic title", "questions": ["...", "..."], "practicalTask": "..." }
  ]
}`;

  try {
    const parsed = (await withAIRetry(() =>
      callAI({
        system: "You are an expert technical mentor. Always respond with valid JSON only.",
        prompt,
        temperature: 0.7,
      })
    )) as AIGeneratedPDPTopics;
    if (departmentId) await ensureCategoryMapping(departmentId);
    parsed.pdpTopics = parsed.pdpTopics.map((topic) => ({
      ...topic,
      category: departmentId ? normalizeCategory(topic.category, departmentId) : topic.category,
    }));
    return parsed;
  } catch (error) {
    console.error("Error generating standalone PDP:", error);
    // Surface the real cause instead of always blaming the API key — a 503/429
    // means the model is overloaded, which is transient and unrelated to auth.
    const status = (error as { status?: number })?.status;
    if (status === 503 || /overloaded|high demand|unavailable/i.test(String(error))) {
      throw new Error(
        "The AI model is temporarily overloaded (503). Please try again in a moment."
      );
    }
    if (status === 429) {
      throw new Error("AI rate limit reached (429). Please try again shortly.");
    }
    throw new Error(
      "Failed to generate PDP via AI. Check OPENROUTER_API_KEY / OPENROUTER_MODEL and try again."
    );
  }
}

// ---------------------------------------------------------------------------
// Interview prep (lib/interview-prep.ts normalizes what these return)
// ---------------------------------------------------------------------------

export interface InterviewPrepRequest {
  targetGradeLabel: string;
  band: "jun" | "mid" | "sen";
  assessmentType: string;
  language: "ru" | "en";
  topics: PrepCandidateTopic[];
  /** Titles already prepared earlier — no questions needed, but the focus line should cover them. */
  alreadyPrepared?: string[];
}

const PREP_LANGUAGE_NAMES = { ru: "RUSSIAN", en: "ENGLISH" } as const;

function describePrepTopic(t: PrepCandidateTopic): string {
  const s = t.signals;
  const lines = [`- topicId: ${t.id}`, `  title: ${t.title} (section: ${t.sectionTitle})`];
  lines.push(`  expected skills: ${t.skills.length ? t.skills.join("; ") : "not specified — use common expectations for the grade"}`);
  if (s.pastScore !== null || s.pastComment) {
    lines.push(`  previous assessment: score ${s.pastScore ?? "n/a"}/10${s.pastComment ? `, assessor comment: "${s.pastComment}"` : ""}`);
  }
  if (s.inPdp) {
    lines.push(`  in the candidate's development plan (PDP)${s.pdpQuestions.length ? `, studied: ${s.pdpQuestions.join("; ")}` : ""}`);
  }
  if (s.selfScore !== null) {
    lines.push(`  self-assessment: ${s.selfScore}/10${s.selfComment ? ` ("${s.selfComment}")` : ""}`);
  }
  return lines.join("\n");
}

const PREP_QUESTION_SHAPE = `{
  "text": "The question exactly as the assessor would ask it",
  "level": "jun" | "mid" | "sen",
  "reason": "past_gap" | "pdp" | "self_check" | "coverage",
  "keyPoints": ["What a good answer must contain", "..."],
  "redFlags": ["Answer that signals a gap", "..."],
  "followUp": "One deeper follow-up question, or null"
}`;

const PREP_TASK_SHAPE = `{ "title": "Short title", "description": "The task, solvable in 10-15 minutes during the call", "expectations": ["What a good solution shows", "..."] }`;

function prepPreamble(req: InterviewPrepRequest): string {
  const pdpReview = req.assessmentType === "PDP_CHECK";
  return `You are a senior engineer preparing to interview a candidate in an internal technical assessment.
Target grade: ${req.targetGradeLabel} (band "${req.band}").
${pdpReview ? "This is a PDP review: the goal is to verify the candidate actually mastered the topics of their development plan." : "The goal is to decide whether the candidate meets the target grade."}

How to use the context per topic:
- "expected skills" are the PRIMARY basis — questions must check these at the target grade.
- A previous low score or comment marks a known gap: include a question that checks whether it is closed (reason "past_gap").
- PDP topics: check that the studied material was really learned, not memorized (reason "pdp").
- Self-assessment is OPTIONAL and often missing or unreliable — use it only as a hint; a high self-score on a topic deserves one probing question (reason "self_check").
- Otherwise use reason "coverage".

Question quality:
- Prefer "why / how does it work / what happens if / how would you design" over definitions.
- Practical, scenario-based, answerable verbally in 3-5 minutes. No trivia, no trick questions.
- Mix levels around the target band so the assessor can find the ceiling.

All text values MUST be in ${PREP_LANGUAGE_NAMES[req.language]}. Keep technical terms, API and code identifiers in their original form.`;
}

async function runPrepPrompt(prompt: string, retry = { attempts: 3, baseMs: 800 }): Promise<unknown> {
  return withAIRetry(
    () => callAI({ system: "Always respond with valid JSON only.", prompt, temperature: 0.6 }),
    retry.attempts,
    retry.baseMs
  );
}

/** Questions for every requested topic, plus an overall focus line. */
export async function generateInterviewPrep(req: InterviewPrepRequest): Promise<unknown> {
  if (process.env.AI_MOCK === "true") return mockInterviewPrep(req);

  const prompt = `${prepPreamble(req)}

Topics:
${req.topics.map(describePrepTopic).join("\n")}

For EACH topic produce 2-3 questions. Use the exact topicId given above.
${req.alreadyPrepared?.length ? `These topics are also part of the interview but already have questions — do NOT produce questions for them: ${req.alreadyPrepared.join("; ")}.\n` : ""}Also write "focus": 1-2 sentences telling the assessor where to dig hardest across the whole interview and why.

Respond ONLY with JSON:
{
  "focus": "...",
  "topics": [
    { "topicId": "...", "questions": [${PREP_QUESTION_SHAPE}] }
  ]
}`;
  try {
    // Runs in the background (lib/interview-prep runPrepGeneration), so it can
    // afford to wait out transient 503/429 spikes.
    return await runPrepPrompt(prompt, { attempts: 5, baseMs: 2000 });
  } catch (error) {
    console.error("Error generating interview prep:", error);
    throw new Error("Failed to generate interview questions.");
  }
}

/** Extra questions for one topic, avoiding the ones already prepared. */
export async function generateMorePrepQuestions(
  req: InterviewPrepRequest,
  existing: string[]
): Promise<unknown> {
  if (process.env.AI_MOCK === "true") return { questions: mockQuestions(req.topics[0], 2, existing.length) };

  const prompt = `${prepPreamble(req)}

Topic:
${req.topics.map(describePrepTopic).join("\n")}

Already prepared (do NOT repeat or rephrase these):
${existing.map((q) => `- ${q}`).join("\n") || "- none"}

Produce 2 NEW questions covering different skills or angles.
Respond ONLY with JSON: { "questions": [${PREP_QUESTION_SHAPE}] }`;
  try {
    return await runPrepPrompt(prompt);
  } catch (error) {
    console.error("Error generating more interview questions:", error);
    throw new Error("Failed to generate more questions.");
  }
}

/** A short live-coding / design task for one topic. */
export async function generatePrepTask(req: InterviewPrepRequest): Promise<unknown> {
  if (process.env.AI_MOCK === "true") return { task: mockTask(req.topics[0]) };

  const prompt = `${prepPreamble(req)}

Topic:
${req.topics.map(describePrepTopic).join("\n")}

Produce ONE practical task for this topic at the target grade.
Respond ONLY with JSON: { "task": ${PREP_TASK_SHAPE} }`;
  try {
    return await runPrepPrompt(prompt);
  } catch (error) {
    console.error("Error generating interview task:", error);
    throw new Error("Failed to generate a practical task.");
  }
}

// Local development only (AI_MOCK=true): the UI still needs realistic data to be built against.
function mockQuestions(topic: PrepCandidateTopic | undefined, count: number, offset = 0) {
  const title = topic?.title ?? "Topic";
  const reason = topic?.signals.pastScore != null && topic.signals.pastScore <= 6
    ? "past_gap"
    : topic?.signals.inPdp ? "pdp" : "coverage";
  return Array.from({ length: count }, (_, i) => ({
    text: `[mock] Вопрос ${offset + i + 1} по теме «${title}»: как это работает под капотом и где это ломается?`,
    level: i === 0 ? "mid" : "sen",
    reason: i === 0 ? reason : "coverage",
    keyPoints: [`Ключевая идея ${title}`, "Компромиссы и ограничения"],
    redFlags: ["Отвечает определением без понимания"],
    followUp: i === 0 ? "А что изменится под высокой нагрузкой?" : null,
  }));
}

function mockTask(topic: PrepCandidateTopic | undefined) {
  return {
    title: `[mock] Задача: ${topic?.title ?? "Topic"}`,
    description: "Опишите решение и обсудите альтернативы.",
    expectations: ["Рабочее решение", "Осознанные компромиссы"],
  };
}

function mockInterviewPrep(req: InterviewPrepRequest) {
  return {
    focus: "[mock] Сфокусируйтесь на темах с прошлыми пробелами и проверьте глубину понимания, а не определения.",
    topics: req.topics.map((t) => ({ topicId: t.id, questions: mockQuestions(t, 2) })),
  };
}
