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
