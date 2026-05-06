import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentSubject,
} from "@/lib/auth-helpers";
import { selfAssessmentSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentRead(id);
  if (guard.error) return guard.error;

  const items = await prisma.selfAssessment.findMany({
    where: { assessmentId: id },
    orderBy: { sectionId: "asc" },
  });
  return NextResponse.json(items);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentSubject(id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, selfAssessmentSchema);
  if (parsed.error) return parsed.error;
  const { items } = parsed.data;

  // Single transaction so a partial save can't leave the user with mixed
  // versions of their self-assessment.
  await prisma.$transaction(
    items.map((item) =>
      prisma.selfAssessment.upsert({
        where: {
          assessmentId_topicId: {
            assessmentId: id,
            topicId: item.topicId,
          },
        },
        update: { score: item.score, comment: item.comment || null },
        create: {
          assessmentId: id,
          sectionId: item.sectionId,
          topicId: item.topicId,
          score: item.score,
          comment: item.comment || null,
        },
      })
    )
  );

  const updated = await prisma.selfAssessment.findMany({
    where: { assessmentId: id },
  });
  return NextResponse.json(updated);
}
