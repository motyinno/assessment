import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAssessor } from "@/lib/auth-helpers";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAssessor();
  if (error) return error;

  const body = await req.json();
  const { results } = body as {
    results: Array<{
      category: string;
      score: number | null;
      comment?: string;
      subtopics?: string[];
    }>;
  };

  if (!results || !Array.isArray(results)) {
    return NextResponse.json(
      { error: "results array обязателен" },
      { status: 400 }
    );
  }

  // Upsert each result
  const ops = results.map((r) =>
    prisma.assessmentResult.upsert({
      where: {
        assessmentId_category: {
          assessmentId: params.id,
          category: r.category,
        },
      },
      update: {
        score: r.score,
        comment: r.comment || null,
        subtopics: r.subtopics ? JSON.stringify(r.subtopics) : null,
      },
      create: {
        assessmentId: params.id,
        category: r.category,
        score: r.score,
        comment: r.comment || null,
        subtopics: r.subtopics ? JSON.stringify(r.subtopics) : null,
      },
    })
  );

  await prisma.$transaction(ops);

  const saved = await prisma.assessmentResult.findMany({
    where: { assessmentId: params.id },
  });

  return NextResponse.json(saved);
}
