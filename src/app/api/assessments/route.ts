import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAssessor } from "@/lib/auth-helpers";
import { buildSessionsForGrade } from "@/lib/assessment-sessions";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const role = session!.user.role;
  const where =
    role === "ADMIN" || role === "ASSESSOR"
      ? {}
      : { participants: { some: { userId: session!.user.id } } };

  const assessments = await prisma.assessment.findMany({
    where,
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { results: true, pdps: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assessments);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAssessor();
  if (error) return error;

  const body = await req.json();
  const { title, grade, scheduledAt, notes, participants } = body;

  if (!title || !grade) {
    return NextResponse.json(
      { error: "Название и грейд обязательны" },
      { status: 400 }
    );
  }

  const assessment = await prisma.assessment.create({
    data: {
      title,
      grade,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      notes,
      participants: {
        create: (participants || []).map(
          (p: { userId: string; participantRole: string; assignedSections?: string[] }) => ({
            userId: p.userId,
            participantRole: p.participantRole,
            assignedSections: p.assignedSections
              ? JSON.stringify(p.assignedSections)
              : null,
          })
        ),
      },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  // Auto-create sessions
  const subject = (participants || []).find(
    (p: { participantRole: string }) => p.participantRole === "SUBJECT"
  );
  if (subject) {
    const subjectUser = await prisma.user.findUnique({
      where: { id: subject.userId },
      select: { softAiInterviewPassed: true },
    });
    const templates = buildSessionsForGrade(
      grade,
      subjectUser?.softAiInterviewPassed ?? false
    );
    await prisma.assessmentSession.createMany({
      data: templates.map((t) => ({ assessmentId: assessment.id, ...t })),
    });
  }

  return NextResponse.json(assessment, { status: 201 });
}
