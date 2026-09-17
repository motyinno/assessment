import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { isUserInScope } from "@/lib/admin-scope";
import { addParticipantSchema } from "@/lib/schemas";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";

/** Resolves the assessment's SUBJECT user id, for scope checks. */
async function subjectOf(assessmentId: string): Promise<string | null> {
  const subject = await prisma.assessmentParticipant.findFirst({
    where: { assessmentId, participantRole: "SUBJECT" },
    select: { userId: true },
  });
  return subject?.userId ?? null;
}

/**
 * Roster edits (add/remove assessors) are allowed only while the assessment is
 * still active. Returns a response to short-circuit on, or null when editable.
 */
async function assertRosterEditable(assessmentId: string): Promise<Response | null> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { status: true },
  });
  if (!assessment) return notFound("Assessment not found");
  if (assessment.status === "COMPLETED" || assessment.status === "CANCELLED") {
    return badRequest("Can't change assessors on a completed or cancelled assessment");
  }
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdminScope();
  if (guard.error) return guard.error;

  const subjectId = await subjectOf(params.id);
  if (subjectId && !(await isUserInScope(subjectId, guard.scope))) return forbidden();

  const blocked = await assertRosterEditable(params.id);
  if (blocked) return blocked;

  const parsed = await parseJsonBody(req, addParticipantSchema);
  if (parsed.error) return parsed.error;
  const { userId, participantRole, assignedSections } = parsed.data;

  const candidate = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isArchived: true },
  });
  if (!candidate) return notFound("User not found");
  if (candidate.isArchived) {
    return badRequest("Can't add an archived user to an assessment");
  }

  // Assessors must be assessors or managers, and a subject's own manager can't
  // assess them. Mirrors the client-side picker filter so a direct API call
  // can't create an invalid roster.
  if (participantRole === "ASSESSOR") {
    if (candidate.role !== "ASSESSOR" && candidate.role !== "MANAGER") {
      return badRequest("Only assessors or managers can be added as assessors");
    }
    const subject = await prisma.assessmentParticipant.findFirst({
      where: { assessmentId: params.id, participantRole: "SUBJECT" },
      select: { user: { select: { managerId: true } } },
    });
    if (subject?.user.managerId === userId) {
      return badRequest("A subject's own manager can't be their assessor");
    }
  }

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
  const guard = await requireAdminScope();
  if (guard.error) return guard.error;

  const subjectId = await subjectOf(params.id);
  if (subjectId && !(await isUserInScope(subjectId, guard.scope))) return forbidden();

  const blocked = await assertRosterEditable(params.id);
  if (blocked) return blocked;

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
