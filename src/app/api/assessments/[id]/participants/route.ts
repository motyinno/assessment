import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAssessor();
  if (error) return error;

  const body = await req.json();
  const { userId, participantRole, assignedSections } = body;

  if (!userId || !participantRole) {
    return NextResponse.json(
      { error: "userId и participantRole обязательны" },
      { status: 400 }
    );
  }

  const participant = await prisma.assessmentParticipant.create({
    data: {
      assessmentId: params.id,
      userId,
      participantRole,
      assignedSections: assignedSections
        ? JSON.stringify(assignedSections)
        : null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(participant, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAssessor();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const participantId = searchParams.get("participantId");

  if (!participantId) {
    return NextResponse.json(
      { error: "participantId обязателен" },
      { status: 400 }
    );
  }

  await prisma.assessmentParticipant.delete({
    where: { id: participantId, assessmentId: params.id },
  });

  return NextResponse.json({ ok: true });
}
