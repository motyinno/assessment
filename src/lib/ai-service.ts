import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeCategory } from "./category-mapper";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
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
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

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
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
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
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

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
