import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { isAdmin, isStaff, isSuperAdmin } from "@/lib/roles";

type ScopeUser = { id: string; role?: string | null; isSuperAdmin?: boolean | null };

/**
 * Every department the given user belongs to, plus every sub-department
 * beneath each (the path-prefix convention from
 * `rebuildDepartmentPaths`/`withDescendantCounts`, see lib/hrm/tree.ts and
 * lib/departments.ts). Returns an empty set for someone with no department
 * membership at all.
 */
/**
 * The division is the access boundary: everyone below super-admin only ever
 * sees and acts on people in their OWN division (`User.divisionId`, see
 * lib/org-structure.ts). It used to be "every unit I'm a member of plus its
 * subtree", but HRM puts one person in ~2.6 units at every level, so that
 * leaked across divisions through whichever extra units someone happened to
 * be tagged with.
 *
 * A scope is the set of division ids the caller may see — today at most one.
 *
 * `null`   = unrestricted (super-admin).
 * `Set()`  = no division at all: sees/can act on nothing, rather than
 *            falling back to "everything".
 */
export type DivisionScope = Set<string> | null;

async function computeDivisionScope(userId: string): Promise<Set<string>> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { divisionId: true },
  });
  return new Set(me?.divisionId ? [me.divisionId] : []);
}

/**
 * Scope for admin-only surfaces (requests, reviews, statistics, editing
 * people). `null` for a super-admin, and also for a non-admin — callers only
 * invoke this after their own role gate already passed.
 */
export async function getAdminDivisionScope(
  user: ScopeUser | null | undefined
): Promise<DivisionScope> {
  if (!user) return new Set();
  if (isSuperAdmin(user) || !isAdmin(user.role)) return null;
  return computeDivisionScope(user.id);
}

/**
 * Same as `getAdminDivisionScope`, but for any staff role (ASSESSOR/MANAGER/
 * ADMIN) — the read surfaces every staff member has (assessment lists, PDP
 * lists, the user directory). Only a super-admin is unrestricted.
 */
export async function getStaffDivisionScope(
  user: ScopeUser | null | undefined
): Promise<DivisionScope> {
  if (!user) return new Set();
  if (isSuperAdmin(user) || !isStaff(user.role)) return null;
  return computeDivisionScope(user.id);
}

/**
 * Prisma filter for "this user is inside the scope". Spread it into a
 * `UserWhereInput` (or a relation's `user: {...}`); `{}` when unrestricted.
 * An empty scope matches nobody, since `in: []` selects nothing.
 */
export function userInScopeWhere(scope: DivisionScope): Prisma.UserWhereInput {
  return scope ? { divisionId: { in: [...scope] } } : {};
}

/** `scope === null` means unrestricted (super-admin). */
export async function isUserInScope(userId: string, scope: DivisionScope): Promise<boolean> {
  if (scope === null) return true;
  if (scope.size === 0) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { divisionId: true },
  });
  return !!user?.divisionId && scope.has(user.divisionId);
}

/**
 * Is this org unit the scoped division itself or somewhere beneath it? `path`
 * is the root-first chain of ids ending with the unit itself (see
 * `rebuildDepartmentPaths`), so the division appears in it as a segment.
 */
export function isDepartmentPathInScope(path: string, scope: DivisionScope): boolean {
  if (scope === null) return true;
  return path.split("/").some((segment) => scope.has(segment));
}

/**
 * May this person edit a unit's own settings (today: its meeting guest)?
 * A super-admin anywhere; a plain ADMIN only inside their own division; nobody
 * else. Unlike `getAdminDivisionScope`, a non-admin gets `false` here rather
 * than a `null` that reads as unrestricted.
 */
export async function canConfigureDepartment(
  user: ScopeUser | null | undefined,
  departmentId: string
): Promise<boolean> {
  if (!user || !isAdmin(user.role)) return false;
  const scope = await getAdminDivisionScope(user);
  if (scope === null) return true;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { path: true },
  });
  return !!dept && isDepartmentPathInScope(dept.path, scope);
}

/** The fields every admin-audience consumer needs (in-app notify + Chat mention). */
export interface ResponsibleAdmin {
  id: string;
  name: string;
  email: string;
  googleId: string | null;
}

const RESPONSIBLE_ADMIN_SELECT = {
  id: true,
  name: true,
  email: true,
  googleId: true,
} as const;

/**
 * The admins who should hear about something that happened to `userId` — the
 * inverse of `getAdminDivisionScope`: not "what may this admin see" but "who
 * administers this person".
 *
 * Everything person-shaped (a new assessment request, an assessment submitted
 * for grade review) used to go to EVERY admin in the company — 109 people on
 * live data, all of them added to the request's Google Chat space and
 * @mentioned in it. That is the wrong audience and an unusable chat room.
 *
 * Only the admins who can actually act on the person are told: the admins of
 * the person's own division, else the super-admins. There used to be a middle
 * tier (admins of an ancestor unit), but with the division as the access
 * boundary those admins can't open the request they'd be pinged about.
 * 19 of 54 live divisions have no admin at all and 51 people have no division;
 * those go to the super-admins rather than to nobody.
 *
 * The person themself is never in the result — nobody needs a notification
 * about their own request. Archived admins are excluded.
 */
export async function getAdminsResponsibleFor(userId: string): Promise<ResponsibleAdmin[]> {
  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: { divisionId: true },
  });
  if (!subject) return [];

  const base = { role: "ADMIN" as const, isArchived: false, id: { not: userId } };

  if (subject.divisionId) {
    const sameDivision = await prisma.user.findMany({
      where: { ...base, divisionId: subject.divisionId },
      select: RESPONSIBLE_ADMIN_SELECT,
      orderBy: { name: "asc" },
    });
    if (sameDivision.length > 0) return sameDivision;
  }

  return getSuperAdmins(userId);
}

/**
 * Super-admins — the org-wide operators. The fallback of `getAdminsResponsibleFor`,
 * and the right audience on its own whenever an event can't be attributed to a
 * person at all: falling back to every admin in the company there would quietly
 * restore the 109-recipient blast this all exists to stop.
 */
export async function getSuperAdmins(excludeUserId?: string): Promise<ResponsibleAdmin[]> {
  return prisma.user.findMany({
    where: {
      role: "ADMIN",
      isArchived: false,
      isSuperAdmin: true,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: RESPONSIBLE_ADMIN_SELECT,
    orderBy: { name: "asc" },
  });
}
