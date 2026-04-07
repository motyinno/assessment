import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

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
  const { error, session } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  // Verify the user is a SUBJECT of this assessment
  const participant = await prisma.assessmentParticipant.findFirst({
    where: {
      assessmentId: id,
      userId: session!.user.id,
      participantRole: "SUBJECT",
    },
  });

  if (!participant) {
    return NextResponse.json(
      { error: "Только оцениваемый может заполнять самооценку" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { items } = body as {
    items: Array<{ sectionId: string; topicId: string; score: number | null; comment?: string }>;
  };

  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: "items обязателен" }, { status: 400 });
  }

  // Upsert all items
  for (const item of items) {
    await prisma.selfAssessment.upsert({
      where: {
        assessmentId_topicId: {
          assessmentId: id,
          topicId: item.topicId,
        },
      },
      update: {
        score: item.score,
        comment: item.comment || null,
      },
      create: {
        assessmentId: id,
        sectionId: item.sectionId,
        topicId: item.topicId,
        score: item.score,
        comment: item.comment || null,
      },
    });
  }

  const updated = await prisma.selfAssessment.findMany({
    where: { assessmentId: id },
  });

  return NextResponse.json(updated);
}
