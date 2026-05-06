import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isStaff, isAdmin, canManagePeople } from "@/lib/roles";
import { unauthorized, forbidden, notFound } from "@/lib/api-helpers";

type AuthOk = { error: null; session: Session };
type AuthFail = { error: Response; session: null };
type AuthGuard = AuthOk | AuthFail;

export async function requireAuth(): Promise<AuthGuard> {
  const session = await auth();
  if (!session?.user) {
    return { error: unauthorized(), session: null };
  }
  return { error: null, session };
}

export async function requireAssessor(): Promise<AuthGuard> {
  const a = await requireAuth();
  if (a.error) return a;
  if (!isStaff(a.session.user.role)) {
    return { error: forbidden(), session: null };
  }
  return a;
}

export async function requireAdmin(): Promise<AuthGuard> {
  const a = await requireAuth();
  if (a.error) return a;
  if (!isAdmin(a.session.user.role)) {
    return { error: forbidden(), session: null };
  }
  return a;
}

/**
 * Caller must be the target user, an admin, or the target user's manager.
 * Used for mutating /api/users/[id]/* endpoints and PDP-on-behalf-of-user
 * actions.
 */
export async function requireUserAccess(targetUserId: string): Promise<AuthGuard> {
  const a = await requireAuth();
  if (a.error) return a;
  const me = a.session.user;
  if (me.id === targetUserId || isAdmin(me.role)) return a;

  if (canManagePeople(me.role)) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { managerId: true },
    });
    if (target?.managerId === me.id) return a;
  }

  return { error: forbidden(), session: null };
}

type AssessmentGuard =
  | { error: null; session: Session; assessmentId: string }
  | { error: Response; session: null; assessmentId: null };

/**
 * Authorize *read* of an assessment: caller must be admin/assessor (org-wide
 * staff) or a participant of the assessment.
 */
export async function requireAssessmentRead(
  assessmentId: string
): Promise<AssessmentGuard> {
  const a = await requireAuth();
  if (a.error) {
    return { error: a.error, session: null, assessmentId: null };
  }

  const me = a.session.user;
  if (isStaff(me.role)) {
    const exists = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { id: true },
    });
    if (!exists) {
      return { error: notFound("Assessment not found"), session: null, assessmentId: null };
    }
    return { error: null, session: a.session, assessmentId };
  }

  const participant = await prisma.assessmentParticipant.findFirst({
    where: { assessmentId, userId: me.id },
    select: { id: true },
  });
  if (!participant) {
    return { error: forbidden(), session: null, assessmentId: null };
  }
  return { error: null, session: a.session, assessmentId };
}

/**
 * Authorize *mutating* the assessment as an assessor: caller must be admin or
 * a participant on the assessment with role "ASSESSOR".
 */
export async function requireAssessmentAssessor(
  assessmentId: string
): Promise<AssessmentGuard> {
  const a = await requireAuth();
  if (a.error) {
    return { error: a.error, session: null, assessmentId: null };
  }
  const me = a.session.user;

  const exists = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true },
  });
  if (!exists) {
    return { error: notFound("Assessment not found"), session: null, assessmentId: null };
  }

  if (isAdmin(me.role)) {
    return { error: null, session: a.session, assessmentId };
  }

  if (!isStaff(me.role)) {
    return { error: forbidden(), session: null, assessmentId: null };
  }

  const myRole = await prisma.assessmentParticipant.findFirst({
    where: {
      assessmentId,
      userId: me.id,
      participantRole: "ASSESSOR",
    },
    select: { id: true },
  });
  if (!myRole) {
    return { error: forbidden(), session: null, assessmentId: null };
  }
  return { error: null, session: a.session, assessmentId };
}

/**
 * Authorize the SUBJECT of an assessment to act on their own self-assessment.
 */
export async function requireAssessmentSubject(
  assessmentId: string
): Promise<AssessmentGuard> {
  const a = await requireAuth();
  if (a.error) {
    return { error: a.error, session: null, assessmentId: null };
  }
  const me = a.session.user;
  const participant = await prisma.assessmentParticipant.findFirst({
    where: {
      assessmentId,
      userId: me.id,
      participantRole: "SUBJECT",
    },
    select: { id: true },
  });
  if (!participant) {
    return { error: forbidden("Only the subject can submit a self-assessment"), session: null, assessmentId: null };
  }
  return { error: null, session: a.session, assessmentId };
}
