import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAssessor } from "@/lib/auth-helpers";
import { buildSessionsForGrade, SESSION_STATUSES } from "@/lib/assessment-sessions";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const sessions = await prisma.assessmentSession.findMany({
    where: { assessmentId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(sessions);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAssessor();
  if (error) return error;

  const { id } = await params;

  // Check if sessions already exist
  const existing = await prisma.assessmentSession.findFirst({
    where: { assessmentId: id },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Сессии для этой аттестации уже созданы" },
      { status: 400 }
    );
  }

  // Fetch assessment with participants
  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, softAiInterviewPassed: true },
          },
        },
      },
    },
  });

  if (!assessment) {
    return NextResponse.json(
      { error: "Аттестация не найдена" },
      { status: 404 }
    );
  }

  // Find the SUBJECT participant
  const subject = assessment.participants.find(
    (p) => p.participantRole === "SUBJECT"
  );

  if (!subject) {
    return NextResponse.json(
      { error: "Субъект аттестации не найден" },
      { status: 400 }
    );
  }

  const grade = assessment.grade;
  const softAiPassed = subject.user.softAiInterviewPassed;

  const templates = buildSessionsForGrade(grade, softAiPassed);

  await prisma.assessmentSession.createMany({
    data: templates.map((t) => ({
      assessmentId: id,
      ...t,
    })),
  });

  const sessions = await prisma.assessmentSession.findMany({
    where: { assessmentId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(sessions, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session: authSession } = await requireAssessor();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { sessionId, status, notes } = body;

  if (!sessionId || !status) {
    return NextResponse.json(
      { error: "sessionId и status обязательны" },
      { status: 400 }
    );
  }

  // Fetch session with its assessment
  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    include: { assessment: true },
  });

  if (!session || session.assessmentId !== id) {
    return NextResponse.json(
      { error: "Сессия не найдена" },
      { status: 404 }
    );
  }

  // Validate assessment is not cancelled
  if (session.assessment.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Нельзя изменить сессию отменённой аттестации" },
      { status: 400 }
    );
  }

  // Validate status transitions
  const currentStatus = session.status;
  const validTransitions: Record<string, string> = {
    [SESSION_STATUSES.NOT_STARTED]: SESSION_STATUSES.IN_PROGRESS,
    [SESSION_STATUSES.IN_PROGRESS]: SESSION_STATUSES.COMPLETED,
  };

  if (validTransitions[currentStatus] !== status) {
    return NextResponse.json(
      { error: `Невозможно перевести сессию из "${currentStatus}" в "${status}"` },
      { status: 400 }
    );
  }

  // For IN_PROGRESS: check all previous sessions are COMPLETED or SKIPPED
  if (status === SESSION_STATUSES.IN_PROGRESS) {
    const previousSessions = await prisma.assessmentSession.findMany({
      where: {
        assessmentId: id,
        order: { lt: session.order },
      },
    });

    const allPreviousDone = previousSessions.every(
      (s) =>
        s.status === SESSION_STATUSES.COMPLETED ||
        s.status === SESSION_STATUSES.SKIPPED
    );

    if (!allPreviousDone) {
      return NextResponse.json(
        { error: "Все предыдущие сессии должны быть завершены или пропущены" },
        { status: 400 }
      );
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = { status };

  if (status === SESSION_STATUSES.IN_PROGRESS) {
    updateData.startedAt = new Date();
    updateData.assessorId = authSession.user.id;
    updateData.assessorName = authSession.user.name;
  }
  if (status === SESSION_STATUSES.COMPLETED) {
    updateData.completedAt = new Date();
  }
  if (notes !== undefined) {
    updateData.notes = notes;
  }

  const updatedSession = await prisma.assessmentSession.update({
    where: { id: sessionId },
    data: updateData,
  });

  // Side effects

  // 1. If SOFT_AI session completed, mark user as softAiInterviewPassed
  if (
    session.type === "SOFT_AI" &&
    status === SESSION_STATUSES.COMPLETED
  ) {
    const subject = await prisma.assessmentParticipant.findFirst({
      where: {
        assessmentId: session.assessmentId,
        participantRole: "SUBJECT",
      },
    });

    if (subject) {
      await prisma.user.update({
        where: { id: subject.userId },
        data: { softAiInterviewPassed: true },
      });
    }
  }

  // 2. Auto-sync assessment status
  const allSessions = await prisma.assessmentSession.findMany({
    where: { assessmentId: id },
  });

  const hasInProgress = allSessions.some(
    (s) => s.status === SESSION_STATUSES.IN_PROGRESS
  );
  const nonSkippedSessions = allSessions.filter(
    (s) => s.status !== SESSION_STATUSES.SKIPPED
  );
  const allNonSkippedCompleted = nonSkippedSessions.every(
    (s) => s.status === SESSION_STATUSES.COMPLETED
  );

  if (hasInProgress && session.assessment.status === "PLANNED") {
    await prisma.assessment.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });
  }

  if (allNonSkippedCompleted && nonSkippedSessions.length > 0) {
    await prisma.assessment.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return NextResponse.json(updatedSession);
}
