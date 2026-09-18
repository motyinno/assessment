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
async function computeDepartmentScope(userId: string): Promise<Set<string>> {
  const own = await prisma.userDepartment.findMany({
    where: { userId },
    select: { department: { select: { path: true } } },
  });
  if (own.length === 0) return new Set();

  const ownPaths = own.map((o) => o.department.path);
  const all = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, path: true },
  });

  const scope = new Set<string>();
  for (const d of all) {
    if (ownPaths.some((p) => d.path === p || d.path.startsWith(`${p}/`))) {
      scope.add(d.id);
    }
  }
  return scope;
}

/**
 * A plain ADMIN only ever sees/acts on their own department(s) plus every
 * sub-department beneath them. Super-admins stay org-wide, unchanged.
 *
 * `null`   = unrestricted (super-admin, or not an admin at all — callers
 *            only invoke this after their own role gate already passed).
 * `Set()`  = an admin with no department membership at all: sees/can act on
 *            nothing, rather than falling back to "everything".
 */
export async function getAdminDepartmentScope(
  user: ScopeUser | null | undefined
): Promise<Set<string> | null> {
  if (!user) return new Set();
  if (isSuperAdmin(user) || !isAdmin(user.role)) return null;
  return computeDepartmentScope(user.id);
}

/**
 * Same idea as `getAdminDepartmentScope`, but for any staff role
 * (ASSESSOR/MANAGER/ADMIN) — used on read surfaces that today show
 * everything to any staff member (assessment lists, PDP lists, the user
 * directory), not just admins. A super-admin (necessarily an ADMIN) is still
 * unrestricted; every other staff role always gets scoped to their own
 * department(s), same as a plain admin.
 */
export async function getStaffDepartmentScope(
  user: ScopeUser | null | undefined
): Promise<Set<string> | null> {
  if (!user) return new Set();
  if (isSuperAdmin(user) || !isStaff(user.role)) return null;
  return computeDepartmentScope(user.id);
}

/**
 * May this person edit a unit's own settings (today: its meeting guest)?
 * A super-admin anywhere; a plain ADMIN only inside their own units and the
 * sub-units beneath them; nobody else. Unlike `getAdminDepartmentScope`, a
 * non-admin gets `false` here rather than a `null` that reads as unrestricted.
 */
export async function canConfigureDepartment(
  user: ScopeUser | null | undefined,
  departmentId: string
): Promise<boolean> {
  if (!user || !isAdmin(user.role)) return false;
  const scope = await getAdminDepartmentScope(user);
  return scope === null || scope.has(departmentId);
}

/** `scope === null` means unrestricted (super-admin). */
export async function isUserInScope(userId: string, scope: Set<string> | null): Promise<boolean> {
  if (scope === null) return true;
  if (scope.size === 0) return false;
  const count = await prisma.userDepartment.count({
    where: { userId, departmentId: { in: [...scope] } },
  });
  return count > 0;
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
 * inverse of `getAdminDepartmentScope`: not "what may this admin see" but "who
 * administers this person".
 *
 * Everything person-shaped (a new assessment request, an assessment submitted
 * for grade review) used to go to EVERY admin in the company — 109 people on
 * live data, all of them added to the request's Google Chat space and
 * @mentioned in it. That is the wrong audience and an unusable chat room.
 *
 * Three tiers, each used only when the one before it comes up empty, because a
 * strict rule would silently drop requests on the floor: 19 of 54 live
 * divisions have no admin at all (276 people), and 51 more people have no
 * division. Better a wider audience than a request nobody is told about.
 *
 *   1. Admins in the person's own division — 2 to 4 people, the intended case.
 *   2. Admins whose department scope contains them: an admin who is a member of
 *      an ancestor-or-self unit of any unit this person belongs to. This is
 *      exactly the `getAdminDepartmentScope` relation, evaluated from the other
 *      side so it costs one query instead of one per admin. 24-45 people.
 *   3. Super-admins, who are unrestricted by definition. Last resort.
 *
 * The person themself is never in the result — nobody needs a notification
 * about their own request. Archived admins are excluded.
 */
export async function getAdminsResponsibleFor(userId: string): Promise<ResponsibleAdmin[]> {
  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      divisionId: true,
      departments: { select: { department: { select: { path: true } } } },
    },
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

  // `path` is the root-first chain of ids ending with the unit itself, so its
  // segments are exactly that unit and every ancestor of it.
  const ancestorIds = new Set<string>();
  for (const m of subject.departments) {
    for (const segment of m.department.path.split("/")) ancestorIds.add(segment);
  }
  if (ancestorIds.size > 0) {
    const inScope = await prisma.user.findMany({
      where: { ...base, departments: { some: { departmentId: { in: [...ancestorIds] } } } },
      select: RESPONSIBLE_ADMIN_SELECT,
      orderBy: { name: "asc" },
    });
    if (inScope.length > 0) return inScope;
  }

  return getSuperAdmins(userId);
}

/**
 * Super-admins — the org-wide operators. Tier 3 of `getAdminsResponsibleFor`,
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
