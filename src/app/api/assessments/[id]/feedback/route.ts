import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentAssessor,
} from "@/lib/auth-helpers";
import { generateFeedback, type AssessmentResult } from "@/lib/ai-service";
import { badRequest, notFound, log } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentRead(params.id);
  if (guard.error) return guard.error;

  const results = await prisma.assessmentResult.findMany({
    where: { assessmentId: params.id },
    orderBy: { category: "asc" },
  });

  return NextResponse.json(results);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Generating AI feedback consumes API quota and emits feedback about a
  // specific person — restricted to the assessor running the assessment.
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  try {
    const assessment = await prisma.assessment.findUnique({
      where: { id: params.id },
      include: {
        participants: {
          where: { participantRole: "SUBJECT" },
          include: { user: true },
        },
      },
    });
    if (!assessment) return notFound("Assessment not found");

    const subject = assessment.participants[0]?.user;
    if (!subject) return badRequest("No subject found for assessment");

    const results = await prisma.assessmentResult.findMany({
      where: { assessmentId: params.id },
      orderBy: { category: "asc" },
    });

    const assessmentResults: AssessmentResult[] = results.map((r) => ({
      category: r.category,
      score: r.score,
      comment: r.comment || "",
      subtopics: (r.subtopics as string[] | null) ?? [],
    }));

    const aiResponse = await generateFeedback(
      assessmentResults,
      subject.name,
      assessment.grade
    );

    const text = aiResponse.feedback
      .map((f) => `${f.category}\n${f.feedback}`)
      .join("\n\n");

    return NextResponse.json({ text });
  } catch (e) {
    log.error("Feedback generation failed", {
      assessmentId: params.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        error: {
          code: "AI_ERROR",
          message:
            e instanceof Error ? e.message : "Failed to generate feedback",
        },
      },
      { status: 500 }
    );
  }
}
