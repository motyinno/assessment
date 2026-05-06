import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentAssessor,
} from "@/lib/auth-helpers";
import { resultsBatchSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, resultsBatchSchema);
  if (parsed.error) return parsed.error;
  const { results } = parsed.data;

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
        subtopics: r.subtopics ?? Prisma.DbNull,
      },
      create: {
        assessmentId: params.id,
        category: r.category,
        score: r.score,
        comment: r.comment || null,
        subtopics: r.subtopics ?? Prisma.DbNull,
      },
    })
  );

  await prisma.$transaction(ops);

  const saved = await prisma.assessmentResult.findMany({
    where: { assessmentId: params.id },
  });

  return NextResponse.json(saved);
}
