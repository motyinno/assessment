/**
 * Auto-grant of MANAGER/ADMIN roles from HRM org data (see plan S05).
 * `computeRoleGrants()` is pure — no Prisma, no network — so it's testable
 * against fixtures alone, same as mapping.ts/guards.ts. `roleAuditRow()` is a
 * thin helper that shapes one `RoleAuditLog` row from a `RoleGrant`; the
 * actual write happens inside `writeUsersAndMemberships`'s existing
 * transaction (sync.ts), not here.
 *
 * ## The rule, and why it changed
 *
 * Roles come from the person's OWN managerial level (`employee.managerialLevelId`
 * -> `MappedEmployee.managerialLevel`). Nothing else.
 *
 * They used to come from a BACK-REFERENCE instead: "somebody lists you in their
 * `employee.manager`" made you a MANAGER, and "somebody lists you as their
 * `managerM3`/`managerM4`" made you an ADMIN. That was wrong in both directions,
 * because HRM's `employee.manager` is a direct lead/mentor assignment that exists
 * independently of the M1..M5 ladder. Measured on a full live sync of ~7.5k
 * employees:
 *
 *   - 302 of the 807 people who are somebody's `manager` have NO managerial
 *     level at all — plain developers who happened to be assigned as someone's
 *     lead, handed MANAGER and everything it unlocks (other people's grades).
 *   - 93 people who DO have a managerial level stayed plain USER, including
 *     M3s, because nobody happened to list them in the matching field.
 *
 * `employee.manager` is still read — it's `User.managerId`, which is genuinely
 * "who this person reports to". It is simply no longer evidence of a role.
 *
 * ## Why `headId` is not a role source either
 *
 * Heading an org unit looks like the perfect signal and is not one, because HRM
 * does not curate the field. On a live pull of the full org tree:
 *
 *   - ALL 504 units carry a `headId` — it is filled in everywhere, so it
 *     selects nothing.
 *   - 500 of those 504 have `deputyId === headId`, i.e. the two fields aren't
 *     maintained as distinct roles; one person is dropped into both.
 *   - It made 266 people ADMIN who are not on the managerial ladder at all
 *     (151 M1s, 47 M2s, 68 with no level), e.g. a Middle Java developer listed
 *     as head AND deputy of five "TC *" departments, three of them empty.
 *     Only 87 of the 353 heads are M3+, and those are ADMIN on their own merit.
 *
 * `Department.headUserId` is still synced and still shown (the "Head of X"
 * badge on the profile) — it's a real fact about the org chart. It just doesn't
 * hand out permissions.
 */
import type { Role } from "@/lib/roles";
import type { MappedEmployee } from "@/lib/hrm/mapping";

const ROLE_RANK: Record<Role, number> = { USER: 0, ASSESSOR: 1, MANAGER: 2, ADMIN: 3 };

/**
 * Managerial level -> role. M1/M2 lead people (MANAGER); M3+ run departments
 * and up (ADMIN). A plain ADMIN is already confined to their own department
 * subtree by `getAdminDepartmentScope()` — org-wide reach is the separate
 * `isSuperAdmin` flag, which HRM sync never sets.
 */
const ROLE_BY_MANAGERIAL_LEVEL: Record<string, Role> = {
  M1: "MANAGER",
  M2: "MANAGER",
  M3: "ADMIN",
  M4: "ADMIN",
  M5: "ADMIN",
};

export interface RoleGrant {
  hrmEmployeeId: number;
  /** Current role at the time of this run — "USER" when the person doesn't exist locally yet. */
  from: Role;
  /** Always "MANAGER" or "ADMIN" — this function only raises, never lowers or grants ASSESSOR/USER. */
  to: Role;
  /** Which HRM fact triggered the grant (e.g. "managerialLevel:M3"). For the audit trail. */
  hrmField: string;
}

/**
 * Computes the role each HRM employee is entitled to from their own managerial
 * level, then compares it against `existingRoleByHrmEmployeeId` and only emits
 * a grant when it is strictly higher than the role they already hold.
 *
 * Never lowers a role: someone who drops off the managerial ladder keeps the
 * role they have. Correcting roles downward — after this rule changed, or after
 * a genuine demotion in HRM — is a separate, deliberate operation, see
 * scripts/recompute-roles.ts.
 */
export function computeRoleGrants(
  employees: MappedEmployee[],
  existingRoleByHrmEmployeeId: Map<number, Role>
): RoleGrant[] {
  const grants: RoleGrant[] = [];
  for (const e of employees) {
    const entitled = entitledRole(e.managerialLevel);
    if (!entitled) continue;

    const current = existingRoleByHrmEmployeeId.get(e.hrmEmployeeId) ?? "USER";
    // never lowers, never re-grants the same or a lesser floor
    if (ROLE_RANK[entitled.role] <= ROLE_RANK[current]) continue;

    grants.push({
      hrmEmployeeId: e.hrmEmployeeId,
      from: current,
      to: entitled.role,
      hrmField: entitled.hrmField,
    });
  }
  return grants;
}

/**
 * The role this person is entitled to, ignoring whatever role they hold today —
 * `null` for "no automatic role" (i.e. USER). An unrecognized level grants
 * nothing rather than guessing.
 *
 * The single definition of the rule: `computeRoleGrants` (which additionally
 * refuses to lower anyone) and the downward-correction script both call it.
 */
export function entitledRole(managerialLevel: string | null): { role: Role; hrmField: string } | null {
  const role = managerialLevel ? ROLE_BY_MANAGERIAL_LEVEL[managerialLevel] : undefined;
  return role ? { role, hrmField: `managerialLevel:${managerialLevel}` } : null;
}

/** Shapes one `RoleAuditLog` row for an HRM-sync-driven grant. `userId`/`runId` are resolved by the caller (sync.ts). */
export function roleAuditRow(
  grant: RoleGrant,
  userId: string,
  runId: string
): {
  userId: string;
  previousRole: Role;
  newRole: Role;
  source: "HRM_SYNC";
  hrmField: string;
  runId: string;
} {
  return {
    userId,
    previousRole: grant.from,
    newRole: grant.to,
    source: "HRM_SYNC",
    hrmField: grant.hrmField,
    runId,
  };
}
