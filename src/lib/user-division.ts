import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roles";
import { HRM_DIVISION_TYPE } from "@/lib/hrm/types";
import { badRequest, forbidden } from "@/lib/api-helpers";

export interface Division {
  id: string;
  name: string;
}

/**
 * A person's division — the one org level everything in the product is split
 * by (tech matrix, session templates, the user directory).
 *
 * Reads the denormalized `User.divisionId`, which the HRM sync (and the
 * login-time refresh) computes with `resolveDivisionId` — see
 * src/lib/org-structure.ts for the rule itself. This used to walk the
 * `path` of the person's *first* membership on every call, which was both a
 * per-request query storm and unstable: "first by createdAt" is a coin flip
 * among the ~2.6 same-timestamp memberships HRM writes per person.
 *
 * `null` when the person has no division at all — someone with no membership,
 * or whose units sit outside any Division.
 */
export async function resolveUserDivision(userId: string): Promise<Division | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { division: { select: { id: true, name: true } } },
  });
  return user?.division ?? null;
}

/** Every active Division-type department, for the super-admin picker. */
export async function listDivisions(): Promise<Division[]> {
  const rows = await prisma.department.findMany({
    where: { typeName: HRM_DIVISION_TYPE, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

/**
 * Which division a caller may edit the tech matrix / session templates for:
 * a plain ADMIN is always forced to their own resolved division (never a
 * client-supplied one); a super-admin must pass an explicit `departmentId`
 * (they have no "own" division by default), validated against the real
 * Division list. Returns `{ error }` (a ready-to-return Response) instead of
 * throwing, matching this codebase's guard-object convention.
 */
export async function resolveEditableDivision(
  me: { id: string; role?: string | null; isSuperAdmin?: boolean | null },
  requestedDepartmentId: string | null | undefined
): Promise<{ error: null; departmentId: string } | { error: Response; departmentId: null }> {
  if (isSuperAdmin(me)) {
    if (!requestedDepartmentId) {
      return { error: badRequest("departmentId is required"), departmentId: null };
    }
    const divisions = await listDivisions();
    if (!divisions.some((d) => d.id === requestedDepartmentId)) {
      return { error: badRequest("Unknown department"), departmentId: null };
    }
    return { error: null, departmentId: requestedDepartmentId };
  }

  const own = await resolveUserDivision(me.id);
  if (!own) {
    return {
      error: forbidden("No division resolved for your account — contact a super-admin"),
      departmentId: null,
    };
  }
  return { error: null, departmentId: own.id };
}

/**
 * For editing something that already belongs to a fixed department (e.g. a
 * topic inside an existing section, or an existing section/session template
 * being patched/deleted) — checks the caller may edit *that* department,
 * rather than resolving/choosing one. Super-admin: always allowed. Plain
 * admin: only their own resolved division. `null` department (a legacy,
 * pre-department-scoping row) is editable by nobody but a super-admin.
 */
export async function assertCanEditDivision(
  me: { id: string; role?: string | null; isSuperAdmin?: boolean | null },
  departmentId: string | null
): Promise<Response | null> {
  if (isSuperAdmin(me)) return null;
  if (!departmentId) return forbidden("This item predates department scoping — a super-admin must edit it");
  const own = await resolveUserDivision(me.id);
  if (!own || own.id !== departmentId) return forbidden();
  return null;
}
