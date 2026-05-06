import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAssessor } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              grade: true,
              project: true,
              managerId: true,
              manager: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      results: true,
      sessions: { orderBy: { order: "asc" as const } },
      pdps: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Regular users can only see assessments they participate in
  const role = session!.user.role;
  if (role !== "ASSESSOR" && role !== "ADMIN") {
    const isParticipant = assessment.participants.some(
      (p) => p.userId === session!.user.id
    );
    if (!isParticipant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(assessment);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await requireAssessor();
  if (error) return error;

  const body = await req.json();
  const { status, title, notes, scheduledAt, aiFeedback } = body;

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (notes !== undefined) data.notes = notes;
  if (aiFeedback !== undefined) data.aiFeedback = aiFeedback;
  if (scheduledAt !== undefined)
    data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

  if (status !== undefined) {
    data.status = status;
    if (status === "COMPLETED") {
      data.completedAt = new Date();
    }
  }

  const assessment = await prisma.assessment.update({
    where: { id: params.id },
    data,
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  return NextResponse.json(assessment);
}
