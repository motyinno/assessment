import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildSessionsForGrade } from "@/lib/assessment-sessions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { status, assessorIds, adminNotes, assessmentType } = body;
  // backward compat: accept single assessorId too
  const allAssessorIds: string[] = assessorIds || (body.assessorId ? [body.assessorId] : []);

  if (!status || !["APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json(
      { error: "Статус должен быть APPROVED или REJECTED" },
      { status: 400 }
    );
  }

  const resolvedAssessmentType: "GENERAL" | "PDP_CHECK" =
    assessmentType === "PDP_CHECK" ? "PDP_CHECK" : "GENERAL";

  const request = await prisma.assessmentRequest.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!request) {
    return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json(
      { error: "Заявка уже обработана" },
      { status: 400 }
    );
  }

  if (status === "APPROVED") {
    if (allAssessorIds.length === 0) {
      return NextResponse.json(
        { error: "Необходимо назначить хотя бы одного асессора" },
        { status: 400 }
      );
    }

    // Create assessment with subject + all assessors as participants
    const titlePrefix = resolvedAssessmentType === "PDP_CHECK" ? "Проверка ИПР" : "Ассессмент";
    const assessment = await prisma.assessment.create({
      data: {
        title: `${titlePrefix}: ${request.user.name}`,
        grade: request.grade,
        assessmentType: resolvedAssessmentType,
        notes: request.notes,
        participants: {
          create: [
            { userId: request.userId, participantRole: "SUBJECT" },
            ...allAssessorIds.map((aid: string) => ({
              userId: aid,
              participantRole: "ASSESSOR",
            })),
          ],
        },
      },
    });

    // Auto-create sessions
    const sessionTemplates = buildSessionsForGrade(
      request.grade,
      request.user.softAiInterviewPassed,
      resolvedAssessmentType
    );
    await prisma.assessmentSession.createMany({
      data: sessionTemplates.map((t) => ({ assessmentId: assessment.id, ...t })),
    });

    const updated = await prisma.assessmentRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        assessmentType: resolvedAssessmentType,
        assessor: { connect: { id: allAssessorIds[0] } },
        assessorIds: JSON.stringify(allAssessorIds),
        assessment: { connect: { id: assessment.id } },
        adminNotes,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assessor: { select: { id: true, name: true, email: true } },
        assessment: { select: { id: true, title: true, status: true } },
      },
    });

    return NextResponse.json(updated);
  }

  // REJECTED
  const updated = await prisma.assessmentRequest.update({
    where: { id },
    data: { status: "REJECTED", adminNotes },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(updated);
}
