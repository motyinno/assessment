import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth, requireAssessor } from "@/lib/auth-helpers";
import { isStaff } from "@/lib/roles";
import { buildSessionsForGrade } from "@/lib/assessment-sessions";
import { createAssessmentSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const where = isStaff(me.role)
    ? {}
    : { participants: { some: { userId: me.id } } };

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
  const auth = await requireAssessor();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createAssessmentSchema);
  if (parsed.error) return parsed.error;
  const {
    title,
    grade,
    assessmentType,
    scheduledAt,
    notes,
    participants,
    optionalGuestEmail,
  } = parsed.data;

  const resolvedType = assessmentType ?? "GENERAL";

  const subject = participants?.find((p) => p.participantRole === "SUBJECT");

  const sessionTemplates = subject
    ? buildSessionsForGrade(grade, resolvedType)
    : [];

  // Atomic: create assessment + participants + sessions, or none of them.
  const assessment = await prisma.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        title,
        grade,
        assessmentType: resolvedType,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        notes: notes ?? null,
        optionalGuestEmail: optionalGuestEmail ?? null,
        participants: {
          createMany: {
            data: (participants ?? []).map((p) => ({
              userId: p.userId,
              participantRole: p.participantRole,
              assignedSections: p.assignedSections ?? Prisma.DbNull,
            })),
          },
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (sessionTemplates.length > 0) {
      await tx.assessmentSession.createMany({
        data: sessionTemplates.map((t) => ({
          assessmentId: created.id,
          type: t.type as never,
          status: t.status as never,
          order: t.order,
          durationMin: t.durationMin,
        })),
      });
    }

    return created;
  });

  return NextResponse.json(assessment, { status: 201 });
}
