import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isStaff, isAdmin, canManagePeople, isSuperAdmin } from "@/lib/roles";
import { unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { sessionFromBearerToken } from "@/lib/api-tokens";
import { getAdminDepartmentScope, getStaffDepartmentScope, isUserInScope } from "@/lib/admin-scope";

type AuthOk = { error: null; session: Session };
type AuthFail = { error: Response; session: null };
type AuthGuard = AuthOk | AuthFail;

type AuthScopeOk = { error: null; session: Session; scope: Set<string> | null };
type AuthScopeFail = { error: Response; session: null; scope: null };
type AuthScopeGuard = AuthScopeOk | AuthScopeFail;

export async function requireAuth(): Promise<AuthGuard> {
  const tokenSession = await sessionFromBearerToken();
  const session = tokenSession ?? (await auth());
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
 * Like `requireAdmin`, but also resolves the caller's department scope
 * (see lib/admin-scope.ts): `null` for a super-admin (unrestricted),
 * otherwise the set of department ids (own + sub-departments) the caller
 * may see or act on.
 */
export async function requireAdminScope(): Promise<AuthScopeGuard> {
  const a = await requireAdmin();
  if (a.error) return { error: a.error, session: null, scope: null };
  const scope = await getAdminDepartmentScope(a.session.user);
  return { error: null, session: a.session, scope };
}

/** Caller must have the super-admin flag (HRM Sync + Departments). */
export async function requireSuperAdmin(): Promise<AuthGuard> {
  const a = await requireAuth();
  if (a.error) return a;
  if (!isSuperAdmin(a.session.user)) {
    return { error: forbidden(), session: null };
  }
  return a;
}

/** Caller must be a manager or admin. */
export async function requireManager(): Promise<AuthGuard> {
  const a = await requireAuth();
  if (a.error) return a;
  if (!canManagePeople(a.session.user.role)) {
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
 * Authorize *read* of an assessment: caller must be staff (ASSESSOR/MANAGER/
 * ADMIN) whose department scope covers the assessment's subject — or a
 * super-admin, or any staff member who is themselves a participant on it
 * (e.g. the assigned assessor), regardless of scope — or a participant of
 * the assessment (any role).
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
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { participants: { select: { userId: true, participantRole: true } } },
    });
    if (!assessment) {
      return { error: notFound("Assessment not found"), session: null, assessmentId: null };
    }

    const scope = await getStaffDepartmentScope(me);
    if (scope !== null) {
      const isParticipant = assessment.participants.some((p) => p.userId === me.id);
      if (!isParticipant) {
        const subjectIds = assessment.participants
          .filter((p) => p.participantRole === "SUBJECT")
          .map((p) => p.userId);
        const inScope = await Promise.all(subjectIds.map((id) => isUserInScope(id, scope)));
        if (!inScope.some(Boolean)) {
          return { error: forbidden(), session: null, assessmentId: null };
        }
      }
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
 * Authorize *running* an assessment's sessions — scheduling meetings and
 * starting/completing sessions. Allowed for: admins (org-wide), an ASSESSOR
 * participant of the assessment, or the MANAGER of the assessment's subject.
 */
export async function requireAssessmentSessionRunner(
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

  const asAssessor = await prisma.assessmentParticipant.findFirst({
    where: { assessmentId, userId: me.id, participantRole: "ASSESSOR" },
    select: { id: true },
  });
  if (asAssessor) {
    return { error: null, session: a.session, assessmentId };
  }

  if (canManagePeople(me.role)) {
    const managesSubject = await prisma.assessmentParticipant.findFirst({
      where: {
        assessmentId,
        participantRole: "SUBJECT",
        user: { managerId: me.id },
      },
      select: { id: true },
    });
    if (managesSubject) {
      return { error: null, session: a.session, assessmentId };
    }
  }

  return { error: forbidden(), session: null, assessmentId: null };
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
