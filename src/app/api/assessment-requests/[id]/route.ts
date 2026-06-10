import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { buildSessionsForGrade } from "@/lib/assessment-sessions";
import { patchRequestSchema } from "@/lib/schemas";
import {
  badRequest,
  notFound,
  parseJsonBody,
} from "@/lib/api-helpers";
import {
  notifyRequestApproved,
  notifyRequestRejected,
  notifyAssessorsAssigned,
} from "@/lib/notifications";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsed = await parseJsonBody(req, patchRequestSchema);
  if (parsed.error) return parsed.error;
  const { status, assessorIds, assessorId, adminNotes, assessmentType } = parsed.data;

  // Backwards-compat: accept either explicit array or single legacy id.
  const allAssessorIds = Array.from(
    new Set([...(assessorIds ?? []), ...(assessorId ? [assessorId] : [])])
  );

  const resolvedType: "GENERAL" | "PDP_CHECK" =
    assessmentType === "PDP_CHECK" ? "PDP_CHECK" : "GENERAL";

  const request = await prisma.assessmentRequest.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!request) return notFound("Request not found");

  if (request.status !== "PENDING") {
    return badRequest("Request has already been processed");
  }

  const trimmedAdminNotes =
    typeof adminNotes === "string" ? adminNotes.trim() : "";

  if (status === "REJECTED" && !trimmedAdminNotes) {
    return badRequest("Comment is required when rejecting a request");
  }

  if (status === "APPROVED") {
    if (allAssessorIds.length === 0) {
      return badRequest("At least one assessor must be assigned");
    }

    const sessionTemplates = buildSessionsForGrade(
      request.grade,
      resolvedType
    );

    // Create assessment + participants + sessions + flip the request status
    // atomically.
    const updated = await prisma.$transaction(async (tx) => {
      const titlePrefix = resolvedType === "PDP_CHECK" ? "PDP review" : "Assessment";
      const assessment = await tx.assessment.create({
        data: {
          title: `${titlePrefix}: ${request.user.name}`,
          grade: request.grade,
          assessmentType: resolvedType,
          notes: request.notes,
          participants: {
            create: [
              { userId: request.userId, participantRole: "SUBJECT" },
              ...allAssessorIds.map((aid) => ({
                userId: aid,
                participantRole: "ASSESSOR" as const,
              })),
            ],
          },
        },
      });

      if (sessionTemplates.length > 0) {
        await tx.assessmentSession.createMany({
          data: sessionTemplates.map((t) => ({
            assessmentId: assessment.id,
            type: t.type as never,
            status: t.status as never,
            order: t.order,
            durationMin: t.durationMin,
          })),
        });
      }

      // Persist the assessor list on the request via the new join table; the
      // first ID is treated as primary, mirroring legacy `assessorId`.
      await tx.assessmentRequestAssessor.createMany({
        data: allAssessorIds.map((aid, idx) => ({
          requestId: id,
          assessorId: aid,
          isPrimary: idx === 0,
        })),
      });

      return tx.assessmentRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          assessmentType: resolvedType,
          assessment: { connect: { id: assessment.id } },
          adminNotes: trimmedAdminNotes || null,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assessors: {
            include: { assessor: { select: { id: true, name: true, email: true } } },
            orderBy: { isPrimary: "desc" },
          },
          assessment: { select: { id: true, title: true, status: true } },
        },
      });
    });

    if (updated.assessment) {
      await Promise.all([
        notifyRequestApproved(updated.user, updated.assessment.id),
        notifyAssessorsAssigned(
          updated.assessors.map((a) => a.assessor),
          updated.user.name,
          updated.assessment.id
        ),
      ]);
    }

    return NextResponse.json(updated);
  }

  // REJECTED
  const updated = await prisma.assessmentRequest.update({
    where: { id },
    data: { status: "REJECTED", adminNotes: trimmedAdminNotes },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await notifyRequestRejected(updated.user, trimmedAdminNotes);

  return NextResponse.json(updated);
}
