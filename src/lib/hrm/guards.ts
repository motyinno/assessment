/**
 * Pre-write checks for the nightly sync (see plan §"Guard-ы"). Pure
 * functions: no Prisma, no network — they take data already collected in
 * memory (dictionaries, org units, mapped employees, current DB counts) and
 * return a `GuardResult`. Testable against fixtures alone.
 *
 * `CONCURRENT_RUN` is NOT here — it depends on `pg_try_advisory_lock`'s live
 * state, not on any in-memory data, so it lives in `lock.ts`/`sync.ts`. It
 * still reports through the same `GuardResult` shape for uniform handling.
 */
import type { HrmDictionaries } from "@/lib/hrm/dictionaries";
import type { MappedEmployee } from "@/lib/hrm/mapping";
import type { HrmOrgUnit } from "@/lib/hrm/types";

export type GuardKind =
  | "DICTIONARIES_REQUIRED"
  | "EMPTY_ORG_UNITS"
  | "EMPTY_EMPLOYEES"
  | "MASS_DISMISSAL"
  | "MASS_ADMIN_GRANT"
  | "CONCURRENT_RUN";

export type GuardResult = { ok: true } | { ok: false; kind: GuardKind; message: string };

const OK: GuardResult = { ok: true };

function fail(kind: GuardKind, message: string): GuardResult {
  return { ok: false, kind, message };
}

/** Any of the three dictionaries empty -> the sync can't map grades/titles/status reliably. */
export function checkDictionaries(dicts: HrmDictionaries): GuardResult {
  const empty: string[] = [];
  if (dicts.professionalLevel.size === 0) empty.push("professionalLevel");
  if (dicts.jobTitle.size === 0) empty.push("jobTitle");
  if (dicts.employeeStatus.size === 0) empty.push("employeeStatus");
  if (empty.length === 0) return OK;
  return fail(
    "DICTIONARIES_REQUIRED",
    `HRM dictionaries came back empty: ${empty.join(", ")} — refusing to sync without them`
  );
}

export function checkOrgUnits(units: HrmOrgUnit[]): GuardResult {
  if (units.length > 0) return OK;
  return fail("EMPTY_ORG_UNITS", "HRM returned 0 org units — refusing to sync");
}

export function checkEmployees(employees: MappedEmployee[]): GuardResult {
  if (employees.length > 0) return OK;
  return fail("EMPTY_EMPLOYEES", "HRM returned 0 employees — refusing to sync");
}

/**
 * `toArchiveCount / currentActiveCount > maxRatio` (strictly greater — right
 * on the threshold passes). `currentActiveCount === 0` never triggers: there's
 * nothing to protect, and dividing by zero would either throw or always fail.
 */
export function checkMassDismissal(args: {
  toArchiveCount: number;
  currentActiveCount: number;
  maxRatio: number;
}): GuardResult {
  const { toArchiveCount, currentActiveCount, maxRatio } = args;
  if (currentActiveCount === 0 || toArchiveCount === 0) return OK;
  const ratio = toArchiveCount / currentActiveCount;
  if (ratio <= maxRatio) return OK;
  const pct = (ratio * 100).toFixed(0);
  const thresholdPct = (maxRatio * 100).toFixed(0);
  return fail(
    "MASS_DISMISSAL",
    `под архив уходит ${toArchiveCount} из ${currentActiveCount} (${pct}%), порог ${thresholdPct}%`
  );
}

/** `newAdminCount > maxGrants` (strictly greater — right on the threshold passes). */
export function checkMassAdminGrant(args: { newAdminCount: number; maxGrants: number }): GuardResult {
  const { newAdminCount, maxGrants } = args;
  if (newAdminCount <= maxGrants) return OK;
  return fail(
    "MASS_ADMIN_GRANT",
    `роль ADMIN выдаётся ${newAdminCount} новым людям за один прогон, порог ${maxGrants}`
  );
}
