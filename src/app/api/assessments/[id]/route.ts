import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentAssessor,
} from "@/lib/auth-helpers";
import { isAdmin, canManagePeople } from "@/lib/roles";
import { parseJsonBody } from "@/lib/api-helpers";
import { patchAssessmentSchema } from "@/lib/schemas";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentRead(params.id);
  if (guard.error) return guard.error;

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
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  }

  // Viewer-scoped capabilities the client uses to decide which controls to
  // render. Mirrors the server-side guards (requireAssessmentSessionRunner,
  // requireAdmin) so the UI never offers an action the API will reject.
  const me = guard.session.user;
  const managesSubject = assessment.participants.some(
    (p) => p.participantRole === "SUBJECT" && p.user.managerId === me.id
  );
  const isAssessorParticipant = assessment.participants.some(
    (p) => p.participantRole === "ASSESSOR" && p.user.id === me.id
  );
  const viewerCanRunSessions =
    isAdmin(me.role) ||
    isAssessorParticipant ||
    (canManagePeople(me.role) && managesSubject);
  const viewerCanManageRoster =
    isAdmin(me.role) &&
    (assessment.status === "PLANNED" || assessment.status === "IN_PROGRESS");

  return NextResponse.json({
    ...assessment,
    viewerCanRunSessions,
    viewerCanManageRoster,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentAssessor(params.id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, patchAssessmentSchema);
  if (parsed.error) return parsed.error;
  const { title, notes, scheduledAt, aiFeedback, status, optionalGuestEmail } =
    parsed.data;

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (notes !== undefined) data.notes = notes;
  if (aiFeedback !== undefined) data.aiFeedback = aiFeedback;
  if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (optionalGuestEmail !== undefined) {
    // Empty string treated as "clear".
    data.optionalGuestEmail = optionalGuestEmail === "" ? null : optionalGuestEmail;
  }
  if (status !== undefined) {
    data.status = status;
    if (status === "COMPLETED") data.completedAt = new Date();
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
