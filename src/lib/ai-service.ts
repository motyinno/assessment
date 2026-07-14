import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeCategory, ensureCategoryMapping } from "./category-mapper";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Overridable via env so a flaky/overloaded preview model can be swapped
// without a code change or rebuild. Defaults to the model used before.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

/**
 * Retry a Gemini call through transient errors (503 overloaded, 429 rate limit,
 * 500) with exponential backoff. Non-transient errors are re-thrown immediately.
 */
async function withGeminiRetry<T>(
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
        status === 429 ||
        status === 500 ||
        /50\d|overloaded|high demand|unavailable|rate limit/i.test(String(e));
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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await withGeminiRetry(() =>
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "You are a precise technical writer. Always respond with valid JSON only.",
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: "application/json",
        },
      })
    );

    const responseContent = result.response.text();
    if (!responseContent) throw new Error("No response content from Gemini");

    const parsed = JSON.parse(responseContent) as AIGeneratedDailyTopic;
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
  grade: string
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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "You are an expert technical assessor and mentor. You provide constructive, actionable feedback. Always respond with valid JSON only.",
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    });

    const responseContent = result.response.text();
    if (!responseContent) {
      throw new Error("No response content from Gemini");
    }

    const parsed = JSON.parse(responseContent) as AIGeneratedFeedback;
    console.log("AI Feedback Response:", JSON.stringify(parsed, null, 2));

    // Normalize category names to match tech matrix titles
    await ensureCategoryMapping();
    parsed.feedback = parsed.feedback.map((item) => ({
      ...item,
      category: normalizeCategory(item.category),
    }));

    return parsed;
  } catch (error) {
    console.error("Error generating AI feedback:", error);
    throw new Error("Failed to generate AI feedback. Please check your Gemini API key and try again.");
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
  grade: string
): Promise<AIGeneratedPDPTopics> {
  if (topics.length === 0) {
    return { pdpTopics: [] };
  }

  const topicsList = topics
    .map(
      (t) =>
        `- ${t.title} (grade-relevant skills: ${t.skills.length ? t.skills.join("; ") : "general fundamentals"})`
    )
    .join("\n");

  const prompt = `You are an expert technical mentor preparing a Professional Development Plan (PDP) for an employee.

Employee Name: ${employeeName}
Grade: ${grade}

Topics to cover (from the ${grade}-grade technical matrix):
${topicsList}

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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "You are an expert technical mentor. Always respond with valid JSON only.",
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    });

    const responseContent = result.response.text();
    if (!responseContent) throw new Error("No response content from Gemini");

    const parsed = JSON.parse(responseContent) as AIGeneratedPDPTopics;
    await ensureCategoryMapping();
    parsed.pdpTopics = parsed.pdpTopics.map((topic) => ({
      ...topic,
      category: normalizeCategory(topic.category),
    }));
    return parsed;
  } catch (error) {
    console.error("Error generating standalone PDP:", error);
    throw new Error(
      "Failed to generate PDP via AI. Check GEMINI_API_KEY and try again."
    );
  }
}

/**
 * Generate PDP topics (questions and practical tasks) based on assessment results
 * Results are cached per assessment to avoid regenerating
 */
export async function generatePDPTopics(
  results: AssessmentResult[],
  employeeName: string,
  grade: string,
  assessmentId?: string
): Promise<AIGeneratedPDPTopics> {
  // Prepare the assessment data for AI
  const assessmentData = results
    .map((r) => {
      return `- ${r.category}: Score ${r.score !== null ? r.score : "N/A"}/10. Comment: ${r.comment || "No comment"}. Subtopics: ${r.subtopics.join(", ") || "None"}`;
    })
    .join("\n");

  const prompt = `You are an expert technical assessor helping create a Professional Development Plan (PDP) for an employee.

Employee Name: ${employeeName}
Grade: ${grade}

Assessment Results:
${assessmentData}

Please generate for each category that needs improvement (scores below 7):
   - 2-3 specific questions the employee should study/learn
   - 1 practical task that demonstrates mastery of the topic

IMPORTANT: 
- All questions and practical tasks must be in ENGLISH language.
- Use the EXACT same category name as shown in the Assessment Results above (maintain the original capitalization and formatting, e.g., "TypeScript Fundamentals" not "typescript-fundamentals").

Format your response as JSON with this structure:
{
  "pdpTopics": [
    {
      "category": "Category Name",
      "questions": ["Question 1", "Question 2", "Question 3"],
      "practicalTask": "Description of practical task"
    }
  ]
}

Only include categories in pdpTopics that have scores below 7 or need improvement. If all scores are good, focus on advanced growth areas. Respond ONLY with valid JSON, no other text.`;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "You are an expert technical assessor and mentor. You provide constructive, actionable feedback and create effective professional development plans. Always respond with valid JSON only.",
            },
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    });

    const responseContent = result.response.text();
    if (!responseContent) {
      throw new Error("No response content from Gemini");
    }

    const parsed = JSON.parse(responseContent) as AIGeneratedPDPTopics;
    console.log("AI Response:", JSON.stringify(parsed, null, 2));

    // Normalize category names to match tech matrix titles
    await ensureCategoryMapping();
    parsed.pdpTopics = parsed.pdpTopics.map((topic) => ({
      ...topic,
      category: normalizeCategory(topic.category),
    }));

    // Save to database for caching if assessmentId is provided
    if (assessmentId) {
      const { default: prisma } = await import("@/lib/prisma");
      await prisma.assessment.update({
        where: { id: assessmentId },
        data: { pdpTopics: JSON.stringify(parsed) },
      });
      console.log("PDP topics cached to database");
    }

    return parsed;
  } catch (error) {
    console.error("Error generating AI feedback:", error);
    throw new Error("Failed to generate AI feedback. Please check your Gemini API key and try again.");
  }
}
