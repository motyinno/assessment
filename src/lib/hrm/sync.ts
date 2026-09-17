/**
 * The nightly HRM sync orchestrator (see plan S04). Everything the sync
 * needs (client calls, mapping, field policy) already exists in
 * `src/lib/hrm/*` from S01-S03 — this file only sequences it: fetch
 * everything into memory, run guards BEFORE any write, then write in two
 * passes (records, then cross-references), per the algorithm in the spec.
 *
 * Two public entry points, not one, because a cron/admin route must answer
 * `202` immediately while the sync itself runs for minutes:
 *
 *  - `startHrmSyncRun()` creates the `HrmSyncRun` row synchronously and
 *    returns its id right away; the rest of the work continues in the
 *    background (fire-and-forget, same pattern as `runPdpGeneration`).
 *  - `runHrmSync()` awaits the whole thing — used by `scripts/hrm-discovery.ts`
 *    style tooling and anywhere a full await is actually wanted.
 *
 * Both share `launch()` below so the create-row-then-run sequencing exists
 * exactly once.
 */
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import { hrmConfig, hrmSyncEnabled } from "@/lib/hrm/config";
import { loadDictionaries, type HrmDictionaries } from "@/lib/hrm/dictionaries";
import { fetchOrgUnits } from "@/lib/hrm/org-units";
import { searchEmployees } from "@/lib/hrm/employees";
import { mapEmployee, mapOrgUnit, resolveOrgUnitParents, type MappedEmployee } from "@/lib/hrm/mapping";
import { buildUserWrite } from "@/lib/hrm/apply-user";
import { withHrmSyncLock } from "@/lib/hrm/lock";
import {
  checkDictionaries,
  checkEmployees,
  checkMassAdminGrant,
  checkMassDismissal,
  checkOrgUnits,
} from "@/lib/hrm/guards";
import type { GuardResult } from "@/lib/hrm/guards";
import { computeRoleGrants, roleAuditRow, type RoleGrant } from "@/lib/hrm/roles";
import { rebuildDepartmentPaths } from "@/lib/hrm/tree";
import { compareByOrgSeniority, resolveDivisionId, type DepartmentWithPath } from "@/lib/org-structure";
import { notifyAdminsOfHrmRoleGrants, notifyAdminsOfHrmSyncFailure } from "@/lib/notifications";
import type { HrmOrgUnit } from "@/lib/hrm/types";
import type { Role } from "@/lib/roles";

export interface RunHrmSyncArgs {
  trigger: "CRON" | "MANUAL" | "LOGIN";
  dryRun?: boolean;
}

export interface RunHrmSyncResult {
  runId: string;
  status: string;
  skipped?: boolean;
}

type IssueKind =
  | "NO_CORP_EMAIL"
  | "DUPLICATE_EMAIL"
  | "GRADE_UNMAPPED"
  | "MANAGER_UNRESOLVED"
  | "PARENT_UNRESOLVED"
  | "HEAD_UNRESOLVED";

interface SyncIssue {
  kind: IssueKind;
  hrmEmployeeId: number | null;
  email: string | null;
  userId: string | null;
  message: string;
}

const ORPHAN_RUN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2h — plan/spec step 1

function floatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Orphaned RUNNING runs older than 2 hours -> FAILED + alert. Step 1 of the spec's algorithm, run before a new row is created. */
async function reapOrphanedRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_RUN_MAX_AGE_MS);
  const orphaned = await prisma.hrmSyncRun.findMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
  });
  for (const run of orphaned) {
    const updated = await prisma.hrmSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        failureReason: "orphaned RUNNING run older than 2h, marked FAILED on next sync start",
      },
    });
    await notifyAdminsOfHrmSyncFailure(updated).catch((e) =>
      log.error("hrm sync: failed to notify admins about orphaned run", {
        runId: run.id,
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }
}

async function abortGuard(runId: string, guard: Extract<GuardResult, { ok: false }>): Promise<RunHrmSyncResult> {
  const run = await prisma.hrmSyncRun.update({
    where: { id: runId },
    data: {
      status: "ABORTED_GUARD",
      failureReason: `${guard.kind}: ${guard.message}`,
      finishedAt: new Date(),
    },
  });
  await notifyAdminsOfHrmSyncFailure(run).catch((e) =>
    log.error("hrm sync: failed to notify admins about aborted guard", {
      runId,
      error: e instanceof Error ? e.message : String(e),
    })
  );
  log.warn("hrm sync: aborted by guard", { runId, kind: guard.kind, message: guard.message });
  return { runId, status: "ABORTED_GUARD" };
}

/**
 * Fetch every employee (no `dismissalStatus` filter — this pass needs both
 * ACTUAL and DELETED to tell "dismissed" apart from "never came back at
 * all" in step 10), mapping each page immediately and dropping the raw body.
 */
async function crawlEmployees(
  dicts: HrmDictionaries
): Promise<{ mapped: MappedEmployee[]; issues: SyncIssue[]; employeesSeen: number }> {
  const cfg = hrmConfig();
  const mapped: MappedEmployee[] = [];
  const issues: SyncIssue[] = [];
  const seenEmails = new Map<string, number>(); // email -> hrmEmployeeId of the kept record
  let employeesSeen = 0;
  let page = 0;

  for (;;) {
    const result = await searchEmployees({ page, size: cfg.pageSize });
    for (const raw of result.items) {
      employeesSeen++;
      if (raw.id === null || raw.id === undefined) {
        log.warn("hrm sync: employee with no id, skipped", { page });
        continue;
      }
      const email = raw.email?.trim().toLowerCase();
      if (!email) {
        issues.push({
          kind: "NO_CORP_EMAIL",
          hrmEmployeeId: raw.id,
          email: null,
          userId: null,
          message: `employee ${raw.id} has no corporate email`,
        });
        continue;
      }
      if (seenEmails.has(email)) {
        issues.push({
          kind: "DUPLICATE_EMAIL",
          hrmEmployeeId: raw.id,
          email,
          userId: null,
          message: `email "${email}" already seen for employee ${seenEmails.get(email)}, employee ${raw.id} skipped`,
        });
        continue;
      }
      seenEmails.set(email, raw.id);

      const { employee, issues: mappingIssues } = mapEmployee(raw, dicts);
      for (const issue of mappingIssues) {
        issues.push({ ...issue, userId: null });
      }
      mapped.push(employee);
    }
    if (!result.hasMore) break;
    page++;
  }

  return { mapped, issues, employeesSeen };
}

interface WritePassCounters {
  usersCreated: number;
  usersUpdated: number;
  usersRestored: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  rolesGranted: number;
  adminsGranted: number;
}

/**
 * Pass 1a: Department upsert by hrmId. One transaction for all units
 * (hundreds, not thousands — safe as a single batch, unlike the per-page
 * employee passes). `parentId`/`path`/`depth` are left as-is here; pass 2
 * resolves them once every department has a local id.
 */
async function upsertDepartments(orgUnits: HrmOrgUnit[]): Promise<Map<number, string>> {
  const mapped = orgUnits.map(mapOrgUnit);
  await prisma.$transaction(
    mapped.map((u) =>
      prisma.department.upsert({
        where: { hrmId: u.hrmId },
        create: {
          hrmId: u.hrmId,
          name: u.name,
          orgUnitTypeId: u.orgUnitTypeId,
          typeName: u.typeName,
          isFilterable: u.isFilterable,
          isSinglePerson: u.isSinglePerson,
          parentHrmId: u.parentHrmId,
          isActive: u.isActive,
        },
        update: {
          name: u.name,
          orgUnitTypeId: u.orgUnitTypeId,
          typeName: u.typeName,
          isFilterable: u.isFilterable,
          isSinglePerson: u.isSinglePerson,
          parentHrmId: u.parentHrmId,
          isActive: u.isActive,
        },
      })
    )
  );

  const rows = await prisma.department.findMany({ select: { id: true, hrmId: true } });
  return new Map(rows.map((r) => [r.hrmId, r.id]));
}

/**
 * Pass 1b/1c: one transaction per page-sized chunk of the in-memory mapped
 * set — User upsert (via buildUserWrite, S03's field policy) + membership
 * diff + role grants (S05), keyed off the same `userId`/`emp` in the same
 * per-employee transaction.
 *
 * Returns a hrmEmployeeId -> local user id map, used by pass 2 to resolve
 * `hrmManagerId` without re-querying.
 */
async function writeUsersAndMemberships(
  mapped: MappedEmployee[],
  deptByHrmId: Map<number, string>,
  pageSize: number,
  grants: Map<number, RoleGrant>,
  runId: string
): Promise<{ userIdByHrmEmployeeId: Map<number, string>; counters: WritePassCounters }> {
  const userIdByHrmEmployeeId = new Map<number, string>();
  const counters: WritePassCounters = {
    usersCreated: 0,
    usersUpdated: 0,
    usersRestored: 0,
    membershipsAdded: 0,
    membershipsRemoved: 0,
    rolesGranted: 0,
    adminsGranted: 0,
  };

  for (let i = 0; i < mapped.length; i += pageSize) {
    const chunk = mapped.slice(i, i + pageSize);

    await prisma.$transaction(async (tx) => {
      for (const emp of chunk) {
        const existing = await tx.user.findFirst({
          where: { OR: [{ hrmEmployeeId: emp.hrmEmployeeId }, { email: emp.email }] },
          select: { id: true, grade: true, isArchived: true },
        });

        const write = buildUserWrite(emp, existing ? { grade: existing.grade } : null);
        const grant = grants.get(emp.hrmEmployeeId);

        let userId: string;
        if (write.create) {
          const created = await tx.user.create({
            data: grant ? { ...write.create, role: grant.to as Role } : write.create,
            select: { id: true },
          });
          userId = created.id;
          counters.usersCreated++;
        } else if (write.update && existing) {
          await tx.user.update({
            where: { id: existing.id },
            data: grant ? { ...write.update, role: grant.to as Role } : write.update,
          });
          userId = existing.id;
          counters.usersUpdated++;
          if (existing.isArchived && !emp.isArchived) counters.usersRestored++;
        } else {
          continue;
        }

        userIdByHrmEmployeeId.set(emp.hrmEmployeeId, userId);

        if (grant) {
          await tx.roleAuditLog.create({ data: roleAuditRow(grant, userId, runId) });
          counters.rolesGranted++;
          if (grant.to === "ADMIN") counters.adminsGranted++;
        }

        // Membership diff.
        const targetDeptIds = new Set(
          emp.orgUnitIds.map((id) => deptByHrmId.get(id)).filter((id): id is string => !!id)
        );
        const current = await tx.userDepartment.findMany({
          where: { userId },
          select: { departmentId: true },
        });
        const currentIds = new Set(current.map((m) => m.departmentId));

        const toRemove = [...currentIds].filter((id) => !targetDeptIds.has(id));
        const toAdd = [...targetDeptIds].filter((id) => !currentIds.has(id));

        if (toRemove.length > 0) {
          await tx.userDepartment.deleteMany({ where: { userId, departmentId: { in: toRemove } } });
          counters.membershipsRemoved += toRemove.length;
        }
        if (toAdd.length > 0) {
          await tx.userDepartment.createMany({
            data: toAdd.map((departmentId) => ({ userId, departmentId })),
            skipDuplicates: true,
          });
          counters.membershipsAdded += toAdd.length;
        }

        // M1..M5 chain, raw ids only — `managerId` is resolved in pass 9c
        // alongside the direct manager, once every employee has a local row.
        // Replace-whole-set rather than diff: five rows, and a level HRM
        // cleared must disappear, not linger.
        await tx.userManagerLink.deleteMany({ where: { userId } });
        if (emp.managerChain.length > 0) {
          await tx.userManagerLink.createMany({
            data: emp.managerChain.map((link) => ({
              userId,
              level: link.level,
              hrmManagerId: link.hrmManagerId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
  }

  return { userIdByHrmEmployeeId, counters };
}

/** Pass 2a/2b: resolve Department.parentId and head/deputy links now that every department has a local id. */
async function resolveDepartmentLinks(
  orgUnits: HrmOrgUnit[],
  deptByHrmId: Map<number, string>,
  userIdByHrmEmployeeId: Map<number, string>
): Promise<SyncIssue[]> {
  const issues: SyncIssue[] = [];
  const updates: Promise<unknown>[] = [];

  // `reportsToId` is polymorphic and cannot be read one unit at a time — see
  // resolveOrgUnitParents().
  const parentHrmIdByUnit = resolveOrgUnitParents(orgUnits);

  for (const unit of orgUnits) {
    if (unit.id === null || unit.id === undefined) continue;
    const localId = deptByHrmId.get(unit.id);
    if (!localId) continue;

    const data: { parentId?: string | null; headUserId?: string | null; deputyUserId?: string | null } = {};

    const parentHrmId = parentHrmIdByUnit.get(unit.id) ?? null;
    data.parentId = parentHrmId !== null ? (deptByHrmId.get(parentHrmId) ?? null) : null;
    if (unit.reportsToId !== null && unit.reportsToId !== undefined && data.parentId === null) {
      // A unit that points at its own head is the top of the tree, not a
      // dangling reference — don't report it as an exception.
      const isTop = parentHrmId === null && unit.reportsToId === unit.headId;
      if (!isTop) {
        issues.push({
          kind: "PARENT_UNRESOLVED",
          hrmEmployeeId: null,
          email: null,
          userId: null,
          message: `org unit ${unit.id} reportsToId ${unit.reportsToId} (parent type ${unit.reportsToOrgUnitTypeId}) did not resolve to a fetched org unit`,
        });
      }
    }

    if (unit.headId !== null && unit.headId !== undefined) {
      const headLocalId = userIdByHrmEmployeeId.get(unit.headId) ?? null;
      data.headUserId = headLocalId;
      if (!headLocalId) {
        issues.push({
          kind: "HEAD_UNRESOLVED",
          hrmEmployeeId: unit.headId,
          email: null,
          userId: null,
          message: `org unit ${unit.id} headId ${unit.headId} has no matching local user`,
        });
      }
    }

    if (unit.deputyId !== null && unit.deputyId !== undefined) {
      data.deputyUserId = userIdByHrmEmployeeId.get(unit.deputyId) ?? null;
    }

    if (Object.keys(data).length > 0) {
      updates.push(prisma.department.update({ where: { id: localId }, data }));
    }
  }

  if (updates.length > 0) await Promise.all(updates);
  return issues;
}

/** Pass 2c: resolve User.managerId from hrmManagerId. */
async function resolveManagers(
  mapped: MappedEmployee[],
  userIdByHrmEmployeeId: Map<number, string>
): Promise<{ managersResolved: number; issues: SyncIssue[] }> {
  const issues: SyncIssue[] = [];
  let managersResolved = 0;
  const updates: Promise<unknown>[] = [];

  for (const emp of mapped) {
    if (emp.hrmManagerId === null) continue;
    const userId = userIdByHrmEmployeeId.get(emp.hrmEmployeeId);
    if (!userId) continue; // this employee itself wasn't written (shouldn't happen, but not this pass's job to fix)

    const managerLocalId = userIdByHrmEmployeeId.get(emp.hrmManagerId) ?? null;
    if (!managerLocalId) {
      issues.push({
        kind: "MANAGER_UNRESOLVED",
        hrmEmployeeId: emp.hrmManagerId,
        email: emp.email,
        userId,
        message: `employee ${emp.hrmEmployeeId} manager ${emp.hrmManagerId} not found in this run's fetched set`,
      });
      continue;
    }
    updates.push(prisma.user.update({ where: { id: userId }, data: { managerId: managerLocalId } }));
    managersResolved++;
  }

  if (updates.length > 0) await Promise.all(updates);
  return { managersResolved, issues };
}

/**
 * Pass 2d: resolve `UserManagerLink.managerId` from the raw `hrmManagerId`
 * written in pass 1b. One grouped update per distinct manager instead of one
 * per link (five links per person over thousands of people is a lot of
 * round-trips otherwise). A level whose manager isn't in this run's set keeps
 * `managerId: null` and renders as "-" — deliberately NOT an issue row: HRM's
 * M1/M2 are routinely empty or point outside the synced population, and
 * flooding the exceptions view with them would bury the real ones.
 */
async function resolveManagerLinks(userIdByHrmEmployeeId: Map<number, string>): Promise<number> {
  const links = await prisma.userManagerLink.findMany({
    select: { userId: true, level: true, hrmManagerId: true, managerId: true },
  });

  const byManager = new Map<string | null, Array<{ userId: string; level: number }>>();
  for (const link of links) {
    const resolved = userIdByHrmEmployeeId.get(link.hrmManagerId) ?? null;
    if (resolved === link.managerId) continue; // already correct
    const bucket = byManager.get(resolved) ?? [];
    bucket.push({ userId: link.userId, level: link.level });
    byManager.set(resolved, bucket);
  }

  let resolvedCount = 0;
  for (const [managerId, targets] of byManager) {
    await prisma.userManagerLink.updateMany({
      where: { OR: targets.map((t) => ({ userId: t.userId, level: t.level })) },
      data: { managerId },
    });
    if (managerId !== null) resolvedCount += targets.length;
  }
  return resolvedCount;
}

/**
 * Pass 2e: recompute `User.divisionId` for everyone this run touched.
 *
 * Runs AFTER `path`/`depth` are rebuilt, not inside the membership write:
 * tier 2 of `resolveDivisionId` walks ancestors via `path`, and a department
 * created earlier in this same run still has the empty default path until
 * that pass has run. Doing it here means a brand-new unit's members get the
 * right division on the first run rather than the second.
 */
async function resolveDivisions(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;

  const departments = await prisma.department.findMany({
    select: { id: true, name: true, typeName: true, path: true },
  });
  const byId = new Map(departments.map((d) => [d.id, d]));

  const memberships = await prisma.userDepartment.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, departmentId: true },
  });
  const byUser = new Map<string, DepartmentWithPath[]>();
  for (const m of memberships) {
    const dept = byId.get(m.departmentId);
    if (!dept) continue;
    const bucket = byUser.get(m.userId) ?? [];
    bucket.push(dept);
    byUser.set(m.userId, bucket);
  }

  const current = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, divisionId: true },
  });

  // Group by target division so this is one updateMany per division, not one
  // update per person.
  const byDivision = new Map<string | null, string[]>();
  for (const user of current) {
    const divisionId = resolveDivisionId(byUser.get(user.id) ?? [], byId);
    if (divisionId === user.divisionId) continue;
    const bucket = byDivision.get(divisionId) ?? [];
    bucket.push(user.id);
    byDivision.set(divisionId, bucket);
  }

  let changed = 0;
  for (const [divisionId, ids] of byDivision) {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { divisionId } });
    changed += ids.length;
  }
  return changed;
}

/** Step 10: local users with hrmEmployeeId not seen at all in this run -> archived. Never touches hrmSyncedAt (not "found and synced", just "not found"). */
async function archiveUnseen(seenHrmEmployeeIds: Set<number>): Promise<number> {
  const candidates = await prisma.user.findMany({
    where: { hrmEmployeeId: { not: null }, isArchived: false },
    select: { id: true, hrmEmployeeId: true },
  });
  const toArchive = candidates.filter((u) => u.hrmEmployeeId !== null && !seenHrmEmployeeIds.has(u.hrmEmployeeId));
  if (toArchive.length === 0) return 0;

  await prisma.user.updateMany({
    where: { id: { in: toArchive.map((u) => u.id) } },
    data: { isArchived: true, hrmDismissed: true },
  });
  return toArchive.length;
}

function buildDryRunReport(
  dicts: HrmDictionaries,
  orgUnits: HrmOrgUnit[],
  mapped: MappedEmployee[],
  issues: SyncIssue[],
  roleGrants: RoleGrant[]
) {
  const issuesByKind: Record<string, number> = {};
  for (const issue of issues) issuesByKind[issue.kind] = (issuesByKind[issue.kind] ?? 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    dictionaries: {
      professionalLevel: dicts.professionalLevel.size,
      jobTitle: dicts.jobTitle.size,
      employeeStatus: dicts.employeeStatus.size,
    },
    orgUnits: orgUnits.length,
    employees: mapped.length,
    dismissed: mapped.filter((e) => e.isArchived).length,
    issuesByKind,
    // Computed, NOT applied — dry runs never write.
    rolesGranted: roleGrants.length,
    adminsGranted: roleGrants.filter((g) => g.to === "ADMIN").length,
  };
}

/** The 13-step algorithm proper, given a run row already RUNNING and the lock already held. Never throws — every failure is caught and recorded as a FAILED run. */
async function runHrmSyncBody(runId: string, args: RunHrmSyncArgs): Promise<RunHrmSyncResult> {
  try {
    // 3. dictionaries
    const dicts = await loadDictionaries();
    const dictGuard = checkDictionaries(dicts);
    if (!dictGuard.ok) return await abortGuard(runId, dictGuard);

    // 4. org units
    const orgUnits = await fetchOrgUnits();
    const orgUnitsGuard = checkOrgUnits(orgUnits);
    if (!orgUnitsGuard.ok) return await abortGuard(runId, orgUnitsGuard);

    // 5. employees, paged + mapped immediately
    const { mapped, issues, employeesSeen } = await crawlEmployees(dicts);
    const employeesGuard = checkEmployees(mapped);
    if (!employeesGuard.ok) return await abortGuard(runId, employeesGuard);

    // 6. guards on the in-memory set, before any write
    const currentActiveCount = await prisma.user.count({ where: { isArchived: false } });
    const seenHrmEmployeeIds = new Set(mapped.map((e) => e.hrmEmployeeId));
    const activeWithHrmId = await prisma.user.findMany({
      where: { hrmEmployeeId: { not: null }, isArchived: false },
      select: { hrmEmployeeId: true },
    });
    const dismissedInSet = new Set(mapped.filter((e) => e.isArchived).map((e) => e.hrmEmployeeId));
    const toArchiveCount = activeWithHrmId.filter(
      (u) => u.hrmEmployeeId !== null && (!seenHrmEmployeeIds.has(u.hrmEmployeeId) || dismissedInSet.has(u.hrmEmployeeId))
    ).length;

    const massDismissalGuard = checkMassDismissal({
      toArchiveCount,
      currentActiveCount,
      maxRatio: floatEnv("HRM_SYNC_MAX_DISMISS_RATIO", 0.2),
    });
    if (!massDismissalGuard.ok) return await abortGuard(runId, massDismissalGuard);

    // 6b. role auto-grant (S05): compute against the current DB role of every
    // employee in this run's set, then guard on the number of NEW admins
    // before any write happens.
    const existingRoleRows = await prisma.user.findMany({
      where: { OR: [{ hrmEmployeeId: { in: [...seenHrmEmployeeIds] } }, { email: { in: mapped.map((e) => e.email) } }] },
      select: { hrmEmployeeId: true, email: true, role: true },
    });
    const existingRoleByHrmEmployeeId = new Map<number, Role>();
    const existingRoleByEmail = new Map<string, Role>();
    for (const row of existingRoleRows) {
      if (row.hrmEmployeeId !== null) existingRoleByHrmEmployeeId.set(row.hrmEmployeeId, row.role);
      existingRoleByEmail.set(row.email, row.role);
    }
    // Mirror writeUsersAndMemberships's own match priority (hrmEmployeeId OR
    // email) so a not-yet-linked existing user's role is still the "current"
    // role the grant floor is compared against, not a false "USER".
    for (const emp of mapped) {
      if (!existingRoleByHrmEmployeeId.has(emp.hrmEmployeeId) && existingRoleByEmail.has(emp.email)) {
        existingRoleByHrmEmployeeId.set(emp.hrmEmployeeId, existingRoleByEmail.get(emp.email)!);
      }
    }

    const roleGrants = computeRoleGrants(mapped, existingRoleByHrmEmployeeId);
    const newAdminCount = roleGrants.filter((g) => g.to === "ADMIN").length;
    const massAdminGrantGuard = checkMassAdminGrant({
      newAdminCount,
      maxGrants: intEnv("HRM_SYNC_MAX_ADMIN_GRANTS", 200),
    });
    if (!massAdminGrantGuard.ok) return await abortGuard(runId, massAdminGrantGuard);

    // 7. dry run — report only, no writes
    if (args.dryRun) {
      const report = buildDryRunReport(dicts, orgUnits, mapped, issues, roleGrants);
      await prisma.hrmSyncRun.update({
        where: { id: runId },
        data: {
          status: "DRY_RUN",
          finishedAt: new Date(),
          employeesSeen,
          departmentsUpserted: orgUnits.length,
          report,
        },
      });
      return { runId, status: "DRY_RUN" };
    }

    // 8a. Department upsert (single pass, all units)
    const deptByHrmId = await upsertDepartments(orgUnits);

    // 8b/8c/8d. User + membership + role-grant writes, one transaction per
    // page-sized chunk
    const grantsByHrmEmployeeId = new Map(roleGrants.map((g) => [g.hrmEmployeeId, g]));
    const { userIdByHrmEmployeeId, counters } = await writeUsersAndMemberships(
      mapped,
      deptByHrmId,
      hrmConfig().pageSize,
      grantsByHrmEmployeeId,
      runId
    );

    // 9a/9b. Department parent/head/deputy links
    const deptLinkIssues = await resolveDepartmentLinks(orgUnits, deptByHrmId, userIdByHrmEmployeeId);
    issues.push(...deptLinkIssues);

    // 9c. User.managerId
    const { managersResolved, issues: managerIssues } = await resolveManagers(mapped, userIdByHrmEmployeeId);
    issues.push(...managerIssues);

    // 9d. path/depth
    // Sorted, not raw: with parents resolved correctly the graph is a clean
    // tree, but it is external data — if a future cycle appears,
    // rebuildDepartmentPaths breaks it at whichever node comes first, and an
    // unordered findMany would let path/depth (and the headcount rollups,
    // admin scope and division resolution keyed off them) shift between runs
    // over identical data.
    const allDepts = await prisma.department.findMany({
      select: { id: true, parentId: true, typeName: true, name: true },
    });
    const paths = rebuildDepartmentPaths([...allDepts].sort(compareByOrgSeniority));
    await prisma.$transaction(
      [...paths.entries()].map(([id, info]) =>
        prisma.department.update({ where: { id }, data: { path: info.path, depth: info.depth } })
      )
    );

    // 9e. M1..M5 links + the denormalized Division, both of which need the
    // full local id map (9e) and the rebuilt paths (9d) to exist first.
    const managerLinksResolved = await resolveManagerLinks(userIdByHrmEmployeeId);
    const divisionsResolved = await resolveDivisions([...userIdByHrmEmployeeId.values()]);
    log.info("hrm sync: org structure resolved", { runId, managerLinksResolved, divisionsResolved });

    // 10. archive locally-present users not seen at all in this run
    const usersDismissed = await archiveUnseen(seenHrmEmployeeIds);

    // 12. close the run
    const status = issues.length > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.hrmSyncRun.update({
      where: { id: runId },
      data: {
        status,
        finishedAt: new Date(),
        employeesSeen,
        usersCreated: counters.usersCreated,
        usersUpdated: counters.usersUpdated,
        usersDismissed,
        usersRestored: counters.usersRestored,
        departmentsUpserted: orgUnits.length,
        membershipsAdded: counters.membershipsAdded,
        membershipsRemoved: counters.membershipsRemoved,
        rolesGranted: counters.rolesGranted,
        adminsGranted: counters.adminsGranted,
        managersResolved,
      },
    });
    if (issues.length > 0) {
      await prisma.hrmSyncIssue.createMany({
        data: issues.map((issue) => ({
          runId,
          kind: issue.kind,
          hrmEmployeeId: issue.hrmEmployeeId,
          email: issue.email,
          userId: issue.userId,
          message: issue.message,
        })),
      });
    }

    if (counters.adminsGranted > 0) {
      await notifyAdminsOfHrmRoleGrants({ runId, adminsGranted: counters.adminsGranted }).catch((e) =>
        log.error("hrm sync: failed to notify admins about role grants", {
          runId,
          error: e instanceof Error ? e.message : String(e),
        })
      );
    }

    return { runId, status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("hrm sync: run failed", { runId, error: message });
    const run = await prisma.hrmSyncRun.update({
      where: { id: runId },
      data: { status: "FAILED", finishedAt: new Date(), failureReason: message },
    });
    await notifyAdminsOfHrmSyncFailure(run).catch((notifyErr) =>
      log.error("hrm sync: failed to notify admins about failure", {
        runId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      })
    );
    return { runId, status: "FAILED" };
  }
}

/**
 * Create the `HrmSyncRun` row and hand back both its id and a promise for
 * the eventual result. `hrmSyncEnabled() === false` creates nothing — the
 * rollback flag must leave zero trace, not a row nobody will ever finish.
 */
async function launch(
  args: RunHrmSyncArgs
): Promise<{ runId: string; completion: Promise<RunHrmSyncResult> } | { skipped: true }> {
  if (!hrmSyncEnabled()) return { skipped: true };

  await reapOrphanedRuns();

  const run = await prisma.hrmSyncRun.create({
    data: { status: "RUNNING", trigger: args.trigger, dryRun: !!args.dryRun },
    select: { id: true },
  });

  const completion = withHrmSyncLock(() => runHrmSyncBody(run.id, args)).then(
    async (lockResult): Promise<RunHrmSyncResult> => {
      if (!lockResult.acquired) {
        await prisma.hrmSyncRun.update({
          where: { id: run.id },
          data: { status: "SKIPPED_LOCKED", finishedAt: new Date() },
        });
        return { runId: run.id, status: "SKIPPED_LOCKED", skipped: true };
      }
      return lockResult.result;
    }
  );

  return { runId: run.id, completion };
}

/** Full await — used by tooling/tests that want the finished result, not just a runId. */
export async function runHrmSync(args: RunHrmSyncArgs): Promise<RunHrmSyncResult> {
  const launched = await launch(args);
  if ("skipped" in launched) return { runId: "", status: "SKIPPED", skipped: true };
  return launched.completion;
}

/** Fire-and-forget — used by the HTTP entry points, which must answer 202 immediately. */
export async function startHrmSyncRun(
  args: RunHrmSyncArgs
): Promise<{ runId: string } | { skipped: true }> {
  const launched = await launch(args);
  if ("skipped" in launched) return { skipped: true };
  launched.completion.catch((e) => {
    log.error("hrm sync: background run rejected unexpectedly", {
      runId: launched.runId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
  return { runId: launched.runId };
}
