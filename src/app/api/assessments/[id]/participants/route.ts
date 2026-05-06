import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAssessmentAssessor } from "@/lib/auth-helpers";
import { addParticipantSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, addParticipantSchema);
  if (parsed.error) return parsed.error;
  const { userId, participantRole, assignedSections } = parsed.data;

  const userExists = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!userExists) return notFound("User not found");

  const participant = await prisma.assessmentParticipant.create({
    data: {
      assessmentId: params.id,
      userId,
      participantRole,
      assignedSections: assignedSections ?? Prisma.DbNull,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(participant, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const participantId = searchParams.get("participantId");
  if (!participantId) return badRequest("participantId is required");

  // Use compound where so participantId from another assessment is rejected
  // even if it slips past the URL guard.
  const result = await prisma.assessmentParticipant.deleteMany({
    where: { id: participantId, assessmentId: params.id },
  });
  if (result.count === 0) return notFound("Participant not found");
  return NextResponse.json({ ok: true });
}
