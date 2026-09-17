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
  type HrmEmployeeShortInfo,
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

/** One rung of the M1..M5 chain — `Prisma UserManagerLink` before resolution. */
export interface MappedManagerLink {
  /** 1..5 */
  level: number;
  hrmManagerId: number;
}

export interface MappedEmployee {
  hrmEmployeeId: number;
  email: string;
  name: string;
  jobTitle: string | null;
  grade: Grade | null;
  /** HRM's own professional-level label ("Middle"), as opposed to our overridable `grade`. */
  professionalLevel: string | null;
  /** Normalized "M1".."M5" (see resolveManagerialLevel), or null. */
  managerialLevel: string | null;
  isMentor: boolean;
  isDeliveryCoordinator: boolean;
  /** `managerM1..M5`, only the levels HRM actually populated with an id. */
  managerChain: MappedManagerLink[];
  /** Raw HRM id of the direct manager (`employee.manager?.id`), unresolved — see mapping.ts's MANAGER_FIELD note. */
  hrmManagerId: number | null;
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

const MANAGERIAL_LEVEL_RE = /^M[_\s-]?([1-9])$/i;

/**
 * `employee.managerialLevelId` -> "M1".."M5".
 *
 * The dictionary CODE is tried first (stable) and the translation second
 * (locale text), normalized through the same regex — HRM writes this value as
 * "M2", "M_2" or "M 2" depending on the surface, and the profile card shows a
 * bare "M2".
 *
 * Anything that isn't an M-level becomes `null`, not a pass-through string:
 * the live dictionary is exactly M1..M5 plus `NOT_DEFINED` / "Not defined"
 * (confirmed against stage), and rendering "NOT_DEFINED" in the M-level row
 * would be strictly worse than the "-" that null gives.
 */
export function resolveManagerialLevel(
  employee: Pick<HrmEmployee, "managerialLevelId">,
  dicts: Pick<HrmDictionaries, "managerialLevel" | "managerialLevelCode">
): string | null {
  const levelId = employee.managerialLevelId;
  if (!levelId) return null;

  for (const raw of [dicts.managerialLevelCode.get(levelId), dicts.managerialLevel.get(levelId)]) {
    const m = MANAGERIAL_LEVEL_RE.exec(trimOrEmpty(raw));
    if (m) return `M${m[1]}`;
  }
  return null;
}

/**
 * `managerM1`..`managerM5` -> one link per level that carries an id. HRM sends
 * the key for every level regardless (confirmed live: an empty `managerM1`
 * object with skills maps but no `id`), so a missing/`null` id is "this level
 * is empty", not "this level is absent".
 */
export function mapManagerChain(employee: HrmEmployee): MappedManagerLink[] {
  const byLevel: Array<HrmEmployeeShortInfo | null | undefined> = [
    employee.managerM1,
    employee.managerM2,
    employee.managerM3,
    employee.managerM4,
    employee.managerM5,
  ];
  const links: MappedManagerLink[] = [];
  byLevel.forEach((ref, index) => {
    const hrmManagerId = rawManagerId(ref);
    if (hrmManagerId !== null) links.push({ level: index + 1, hrmManagerId });
  });
  return links;
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
      professionalLevel: employee.professionalLevelId
        ? (dicts.professionalLevel.get(employee.professionalLevelId) ?? null)
        : null,
      managerialLevel: resolveManagerialLevel(employee, dicts),
      isMentor: employee.isMentor === true,
      isDeliveryCoordinator: employee.isDeliveryCoordinator === true,
      managerChain: mapManagerChain(employee),
      hrmManagerId: rawManagerId(employee.manager),
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
  /**
   * `reportsToId` AS SENT — not the parent org unit. Resolving it needs the
   * whole unit set, so use `resolveOrgUnitParents()`; this field exists only
   * because `Department.parentHrmId` stores the raw value. See that function
   * for why it cannot be interpreted on its own.
   */
  parentHrmId: number | null;
  isActive: boolean;
}

/** HRM's name for the single-seat unit type whose id namespace is people, not units. */
const PERSON_TYPE = "Person";

/**
 * `reportsToId` -> the parent unit's `hrmId`, for every unit at once.
 *
 * `reportsToId` is POLYMORPHIC: it is read in the namespace named by the same
 * unit's `reportsToOrgUnitTypeId`. For an ordinary parent type it is an org
 * unit id, but when the parent is a `Person` unit (CEO and friends — one seat,
 * identified by the person sitting in it) it is an EMPLOYEE id, matching that
 * unit's `headId`.
 *
 * Reading it as an org unit id unconditionally — which is what this sync did
 * until 2026-09-17 — silently attaches those units to whatever unrelated unit
 * happens to share the number. Live, that was 13 of 504 units, and it was
 * enough to knot the whole graph: "Global Development" [Unit] landed under
 * "Java VOKA" [Team] (employee 791 = Ivan Shatuho, head of "GDO & DMO"), which
 * produced the cycle that left the Departments page blank and scattered units
 * that belong under Global Development across the top level.
 *
 * A Person unit pointing at its own head is the top of the tree (the CEO
 * reports to the CEO) and normalizes to `null`, as does a reference that
 * resolves to nothing.
 */
export function resolveOrgUnitParents(units: HrmOrgUnit[]): Map<number, number | null> {
  const typeNameById = new Map<number, string>();
  for (const u of units) {
    if (typeof u.orgUnitTypeId === "number" && u.orgUnitTypeDto) {
      const name = u.orgUnitTypeDto.orgUnitTypeNameEn ?? u.orgUnitTypeDto.orgUnitTypeName;
      if (name) typeNameById.set(u.orgUnitTypeId, name);
    }
  }

  const unitIds = new Set<number>();
  const personUnitByHeadId = new Map<number, number>();
  for (const u of units) {
    if (typeof u.id !== "number") continue;
    unitIds.add(u.id);
    const isPersonUnit = typeNameById.get(u.orgUnitTypeId as number) === PERSON_TYPE;
    if (isPersonUnit && typeof u.headId === "number") personUnitByHeadId.set(u.headId, u.id);
  }

  const parents = new Map<number, number | null>();
  for (const u of units) {
    if (typeof u.id !== "number") continue;
    const ref = u.reportsToId;
    if (typeof ref !== "number") {
      parents.set(u.id, null);
      continue;
    }
    const parentIsPerson = typeNameById.get(u.reportsToOrgUnitTypeId as number) === PERSON_TYPE;
    const resolved = parentIsPerson
      ? (personUnitByHeadId.get(ref) ?? null)
      : (unitIds.has(ref) ? ref : null);
    // Self-reference means "top of the tree", not a one-node cycle.
    parents.set(u.id, resolved === u.id ? null : resolved);
  }
  return parents;
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
    // HRM sends the type name in three variants; take the English one so we
    // don't need to translate "Отдел"/"Группа"/etc. on our side — fall back
    // to the generic (localized) field only if HRM omits orgUnitTypeNameEn.
    typeName: type?.orgUnitTypeNameEn ?? type?.orgUnitTypeName ?? null,
    isFilterable: type?.isFilterable ?? true,
    isSinglePerson: type?.isSinglePerson ?? false,
    // Raw, deliberately: interpreting it needs every unit (see
    // resolveOrgUnitParents). `unit.reportsToId ?? null` rather than
    // `"reportsToId" in unit` — the key can be absent entirely.
    parentHrmId: unit.reportsToId ?? null,
    isActive: type?.lifecycleStatus !== HRM_LIFECYCLE_DELETED,
  };
}
