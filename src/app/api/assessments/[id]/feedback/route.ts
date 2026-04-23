import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { generateFeedback, type AssessmentResult } from "@/lib/ai-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const results = await prisma.assessmentResult.findMany({
    where: { assessmentId: params.id },
    orderBy: { category: "asc" },
  });

  return NextResponse.json(results);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    // Get assessment details
    const assessment = await prisma.assessment.findUnique({
      where: { id: params.id },
      include: {
        participants: {
          where: { participantRole: "SUBJECT" },
          include: { user: true },
        },
      },
    });

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const subject = assessment.participants[0]?.user;
    if (!subject) {
      return NextResponse.json({ error: "No subject found for assessment" }, { status: 400 });
    }

    // Get assessment results
    const results = await prisma.assessmentResult.findMany({
      where: { assessmentId: params.id },
      orderBy: { category: "asc" },
    });

    // Convert to AI service format
    const assessmentResults: AssessmentResult[] = results.map((r) => ({
      category: r.category,
      score: r.score,
      comment: r.comment || "",
      subtopics: r.subtopics ? JSON.parse(r.subtopics) : [],
    }));

    // Generate feedback using AI
    const aiResponse = await generateFeedback(
      assessmentResults,
      subject.name,
      assessment.grade
    );

    // Flatten per-category feedback into one readable block so the UI can
    // load it into an editable textarea. The assessor can then tweak and save.
    const text = aiResponse.feedback
      .map((f) => `${f.category}\n${f.feedback}`)
      .join("\n\n");

    return NextResponse.json({ text });
  } catch (error) {
    console.error("Error generating feedback:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate feedback" },
      { status: 500 }
    );
  }
}
