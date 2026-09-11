/**
 * Auto-grant of MANAGER/ADMIN roles from HRM org data (see plan S05).
 * `computeRoleGrants()` is pure — no Prisma, no network — so it's testable
 * against fixtures alone, same as mapping.ts/guards.ts. `roleAuditRow()` is a
 * thin helper that shapes one `RoleAuditLog` row from a `RoleGrant`; the
 * actual write happens inside `writeUsersAndMemberships`'s existing
 * transaction (sync.ts), not here.
 */
import type { Role } from "@/lib/roles";
import { mapOrgUnit, type MappedEmployee } from "@/lib/hrm/mapping";
import type { HrmOrgUnit } from "@/lib/hrm/types";

const ROLE_RANK: Record<Role, number> = { USER: 0, ASSESSOR: 1, MANAGER: 2, ADMIN: 3 };

export interface RoleGrant {
  hrmEmployeeId: number;
  /** Current role at the time of this run — "USER" when the person doesn't exist locally yet. */
  from: Role;
  /** Always "MANAGER" or "ADMIN" — this function only raises, never lowers or grants ASSESSOR/USER. */
  to: Role;
  /** Which HRM field(s) triggered the grant, joined with "+" when several did (e.g. "employeeManagerId+managerM3"). For the audit trail. */
  hrmField: string;
}

/**
 * Computes the "floor" role each HRM employee is entitled to (from being
 * someone's direct manager, an active org unit's head, or an M3/M4 manager),
 * then compares it against `existingRoleByHrmEmployeeId` and only emits a
 * grant when the floor is strictly higher than the current role.
 *
 * Never lowers a role: an existing ADMIN who no longer meets the M3/M4
 * condition stays ADMIN (this function only computes upgrades — demotion is
 * out of scope, same as ASSESSOR is never touched unless it's being raised).
 *
 * ADMIN takes priority over MANAGER: a person who is both `employeeManagerId`
 * for someone and `managerM3`/`managerM4` for someone else ends up ADMIN,
 * with `hrmField` listing every field that matched so the audit trail
 * doesn't lose information.
 */
export function computeRoleGrants(
  employees: MappedEmployee[],
  orgUnits: HrmOrgUnit[],
  existingRoleByHrmEmployeeId: Map<number, Role>
): RoleGrant[] {
  const managerIds = new Set<number>();
  const headIds = new Set<number>();
  const m3Ids = new Set<number>();
  const m4Ids = new Set<number>();

  for (const e of employees) {
    if (e.hrmManagerId !== null) managerIds.add(e.hrmManagerId);
    if (e.hrmM3ManagerId !== null) m3Ids.add(e.hrmM3ManagerId);
    if (e.hrmM4ManagerId !== null) m4Ids.add(e.hrmM4ManagerId);
  }
  for (const unit of orgUnits) {
    if (!mapOrgUnit(unit).isActive) continue;
    if (unit.headId === null || unit.headId === undefined) continue;
    headIds.add(unit.headId);
  }

  const grants: RoleGrant[] = [];
  for (const e of employees) {
    const id = e.hrmEmployeeId;
    const fields: string[] = [];
    let floor: Role | null = null;

    const isM3 = m3Ids.has(id);
    const isM4 = m4Ids.has(id);
    const isManager = managerIds.has(id);
    const isHead = headIds.has(id);

    if (isM3 || isM4) {
      floor = "ADMIN";
      if (isM3) fields.push("managerM3");
      if (isM4) fields.push("managerM4");
      // ADMIN outranks MANAGER — still record every field that matched,
      // including the MANAGER-level ones, for a complete audit trail.
      if (isManager) fields.push("employeeManagerId");
      if (isHead) fields.push("headId");
    } else if (isManager || isHead) {
      floor = "MANAGER";
      if (isManager) fields.push("employeeManagerId");
      if (isHead) fields.push("headId");
    }

    if (!floor) continue;

    const current = existingRoleByHrmEmployeeId.get(id) ?? "USER";
    if (ROLE_RANK[floor] <= ROLE_RANK[current]) continue; // never lowers, never re-grants the same or a lesser floor

    grants.push({ hrmEmployeeId: id, from: current, to: floor, hrmField: fields.join("+") });
  }
  return grants;
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
