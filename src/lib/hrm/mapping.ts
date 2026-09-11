/**
 * Pure translation functions: HRM wire shapes -> the shapes S03/S04 write to
 * Prisma. Nothing here touches the network or the database — that's what
 * makes it testable against fixtures alone (see tests/hrm/mapping.test.ts).
 */
import { HRM_GRADE_MAP } from "@/lib/hrm/grade-map";
import type { HrmDictionaries } from "@/lib/hrm/dictionaries";
import {
  HRM_LIFECYCLE_ACTUAL,
  HRM_LIFECYCLE_DELETED,
  type HrmEmployee,
  type HrmOrgUnit,
} from "@/lib/hrm/types";
import type { Grade } from "@/lib/grades";

/** Mirrors Prisma `HrmSyncIssue.kind` (schema.prisma) — only the subset this file can produce. */
export interface MappingIssue {
  kind: "GRADE_UNMAPPED";
  hrmEmployeeId: number | null;
  email: string | null;
  message: string;
}

export interface MappedEmployee {
  hrmEmployeeId: number;
  email: string;
  name: string;
  jobTitle: string | null;
  grade: Grade | null;
  /** Raw HRM id of the direct manager (`employee.manager?.id`), unresolved — see mapping.ts's MANAGER_FIELD note. */
  hrmManagerId: number | null;
  /** Raw HRM id of the M3 manager (`employee.managerM3?.id`), unresolved. See roles.ts (S05) — feeds the ADMIN auto-grant. */
  hrmM3ManagerId: number | null;
  /** Raw HRM id of the M4 manager (`employee.managerM4?.id`), unresolved. See roles.ts (S05) — feeds the ADMIN auto-grant. */
  hrmM4ManagerId: number | null;
  isArchived: boolean;
  hrmDismissed: boolean;
  /** Raw `orgUnits[].id`s — resolved to local `Department` rows by a second pass (S04). */
  orgUnitIds: number[];
  /** Parsed from `employee.linkProfilePicture` — see extractPhotoFileName(). Always `photos/<file>` or `null`. */
  photoFileName: string | null;
}

// Two shapes seen for the path inside `linkProfilePicture`: a plain URL path
// (`.../photos/<uuid>.jpeg?...`, every sample checked so far) and a
// `%2F`-encoded one (never observed on live data, but `buildPhotoUrl` in
// photos.ts produces exactly this encoding for the reverse direction, so
// parsing it symmetrically is cheaper than fixing it later as an incident).
const PHOTO_PATH_RE = /\/photos%2F([^&?]+)|\/photos\/([^?]+)/;

/**
 * `employee.linkProfilePicture` -> `photos/<file>`, or `null` when there's no
 * photo or the link doesn't match the expected shape. Never throws — a photo
 * that fails to parse must degrade to initials (S12), not take down the sync.
 */
export function extractPhotoFileName(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (trimmed === "") return null;
  const m = PHOTO_PATH_RE.exec(trimmed);
  if (!m) return null;
  const raw = m[1] ?? m[2];
  try {
    return `photos/${decodeURIComponent(raw)}`;
  } catch {
    return null; // malformed %-escape — don't fail mapEmployee over one bad field
  }
}

function trimOrEmpty(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function joinName(first: string | null | undefined, last: string | null | undefined): string {
  return [trimOrEmpty(first), trimOrEmpty(last)].filter(Boolean).join(" ");
}

/**
 * `firstNameEn lastNameEn` -> `firstNameRu lastNameRu` -> local part of the
 * email. Never throws, never returns an empty string unless the email is
 * also empty/absent.
 */
export function displayName(
  employee: Pick<HrmEmployee, "firstNameEn" | "lastNameEn" | "firstNameRu" | "lastNameRu" | "email">
): string {
  const en = joinName(employee.firstNameEn, employee.lastNameEn);
  if (en) return en;
  const ru = joinName(employee.firstNameRu, employee.lastNameRu);
  if (ru) return ru;
  return trimOrEmpty(employee.email).split("@")[0] ?? "";
}

/**
 * `MANAGER_FIELD` decision, kept as one line per the S03 plan: the direct
 * manager is `employee.manager?.id`. **Not confirmed as the final choice** —
 * `employeeManagers[].managerType.type === "PRIMARY_RM"` is a plausible
 * alternative for the product-facing "manager" (S05's auto-role grant).
 * Changing the decision costs exactly this one line.
 *
 * Generalized (S05) to accept any `{ id }`-shaped short-info ref, so the same
 * helper reads `employee.manager?.id`, `employee.managerM3?.id` and
 * `employee.managerM4?.id` alike.
 */
export function rawManagerId(ref: { id?: number | null } | null | undefined): number | null {
  const id = ref?.id;
  return typeof id === "number" ? id : null;
}

/**
 * `employee.professionalLevelId` -> product `Grade`, via the `professionalLevel`
 * dictionary's stable code (see grade-map.ts). Returns `{ grade: null, issue: null }`
 * when the employee simply has no level at all — that's not an error. An
 * issue is only raised when a level id IS present but doesn't resolve to a
 * known code, or resolves to a code with no product grade (e.g. ARCHITECT).
 */
export function resolveGrade(
  employee: Pick<HrmEmployee, "professionalLevelId" | "id" | "email">,
  dicts: Pick<HrmDictionaries, "professionalLevelCode">
): { grade: Grade | null; issue: MappingIssue | null } {
  const levelId = employee.professionalLevelId;
  if (!levelId) return { grade: null, issue: null };

  const hrmEmployeeId = typeof employee.id === "number" ? employee.id : null;
  const email = employee.email ?? null;

  const code = dicts.professionalLevelCode.get(levelId);
  if (!code) {
    return {
      grade: null,
      issue: {
        kind: "GRADE_UNMAPPED",
        hrmEmployeeId,
        email,
        message: `professionalLevelId "${levelId}" not found in the professionalLevel dictionary`,
      },
    };
  }

  const grade = HRM_GRADE_MAP[code];
  if (!grade) {
    return {
      grade: null,
      issue: {
        kind: "GRADE_UNMAPPED",
        hrmEmployeeId,
        email,
        message: `professionalLevel code "${code}" has no product grade mapping (see grade-map.ts)`,
      },
    };
  }

  return { grade, issue: null };
}

/**
 * HRM employee -> the shape S03/S04 write. Requires `employee.id` and
 * `employee.email` (the matching key and the idempotency key) — filtering out
 * records missing either is the caller's job (an orchestrator concern, not
 * this pure function's), so this throws rather than guessing a fallback.
 */
export function mapEmployee(
  employee: HrmEmployee,
  dicts: HrmDictionaries
): { employee: MappedEmployee; issues: MappingIssue[] } {
  if (employee.id === null || employee.id === undefined) {
    throw new Error("mapEmployee: employee.id is required");
  }
  if (!employee.email) {
    throw new Error("mapEmployee: employee.email is required");
  }

  const issues: MappingIssue[] = [];
  const { grade, issue } = resolveGrade(employee, dicts);
  if (issue) issues.push(issue);

  const isArchived = employee.lifecycleStatus !== HRM_LIFECYCLE_ACTUAL;
  const orgUnitIds = (employee.orgUnits ?? [])
    .map((u) => u.id)
    .filter((id): id is number => typeof id === "number");

  return {
    employee: {
      hrmEmployeeId: employee.id,
      email: trimOrEmpty(employee.email).toLowerCase(),
      name: displayName(employee),
      jobTitle: employee.jobTitleId ? (dicts.jobTitle.get(employee.jobTitleId) ?? null) : null,
      grade,
      hrmManagerId: rawManagerId(employee.manager),
      hrmM3ManagerId: rawManagerId(employee.managerM3),
      hrmM4ManagerId: rawManagerId(employee.managerM4),
      isArchived,
      // Same condition as isArchived: agrees with the ready-made
      // employee.isArchived HRM sends, but derived from lifecycleStatus, the
      // one field this file treats as authoritative — see plan §"Field policy".
      hrmDismissed: isArchived,
      orgUnitIds,
      photoFileName: extractPhotoFileName(employee.linkProfilePicture),
    },
    issues,
  };
}

export interface MappedOrgUnit {
  hrmId: number;
  name: string;
  orgUnitTypeId: number | null;
  typeName: string | null;
  isFilterable: boolean;
  isSinglePerson: boolean;
  /** `reportsToId` as-is; absent key and explicit root both normalize to `null`. */
  parentHrmId: number | null;
  isActive: boolean;
}

/**
 * HRM org unit -> the shape S02's `Department` sync writes. `unit.id` is
 * required (it's `Department.hrmId`, the idempotency key) — same "throw, don't
 * guess" stance as mapEmployee().
 */
export function mapOrgUnit(unit: HrmOrgUnit): MappedOrgUnit {
  if (unit.id === null || unit.id === undefined) {
    throw new Error("mapOrgUnit: unit.id is required");
  }
  const type = unit.orgUnitTypeDto ?? null;
  return {
    hrmId: unit.id,
    name: unit.orgUnitName ?? "",
    orgUnitTypeId: unit.orgUnitTypeId ?? null,
    typeName: type?.orgUnitTypeName ?? null,
    isFilterable: type?.isFilterable ?? true,
    isSinglePerson: type?.isSinglePerson ?? false,
    // `unit.reportsToId ?? null`, deliberately not `"reportsToId" in unit` —
    // the key can be absent entirely rather than present-as-null, and both
    // mean "root" here.
    parentHrmId: unit.reportsToId ?? null,
    isActive: type?.lifecycleStatus !== HRM_LIFECYCLE_DELETED,
  };
}
