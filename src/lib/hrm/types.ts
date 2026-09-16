/**
 * Wire types for the HRM API. Deliberately WIDE: every field optional, every
 * field nullable wherever HRM might send `null`, every enum-shaped field kept
 * as `string`. The `employees/v2/search` response schema in the HRM doc
 * (HRM-Integration-nodeassm.md §1.1) is assembled from fields mentioned along
 * the way, not from one full 200 response — the doc says so explicitly.
 *
 * `HrmEmployee` below was rewritten in S03 against a LIVE stage run (2026-09-09,
 * `temp/hrm-payloads/employees-search.schema.md`), not against the doc/swagger
 * that the original S01 version was written from — the two barely overlap.
 * Known values live as constants (HRM_LIFECYCLE_ACTUAL, HRM_LIFECYCLE_DELETED)
 * while the field type stays `string | null`, so a value HRM adds later never
 * breaks `npm run build`.
 *
 * Growth rule: fields get added as later exploration finds them. None of them
 * become required.
 *
 * No index signature (`[key: string]: unknown`) on HrmEmployee — tempting
 * given the known-incomplete schema, but it turns a typo like
 * `emp.firtNameEn` from a compile error into `unknown`, which then survives
 * typecheck and shows up silently as an empty field after `?? ""`. That's
 * exactly the class of bug that's most expensive here. Exploration that needs
 * the unmodeled remainder can take the raw body as `unknown` in one place
 * instead.
 *
 * Dates are `string | null` (ISO or `YYYY-MM-DD`), never `Date` — this is raw
 * JSON.
 *
 * Zero imports, so both tests and any future client component can pull these
 * in freely (same approach as src/lib/roadmap-types.ts).
 */

/** Request-filter value for `employees/v2/search`'s `dismissalStatus` body param — NOT a field on the response (see HRM_LIFECYCLE_ACTUAL for that). */
export const HRM_DISMISSAL_ACTUAL = "ACTUAL";
/** Response field value: `employee.lifecycleStatus === "ACTUAL"`. */
export const HRM_LIFECYCLE_ACTUAL = "ACTUAL";
export const HRM_LIFECYCLE_DELETED = "DELETED";

export interface HrmTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface HrmAccessTokenClaims {
  exp?: number;
  sub?: string;
  [key: string]: unknown;
}

export interface HrmProject {
  id?: string | null;
  name?: string | null;
}

/**
 * `orgUnitTypeDto` on OrgUnitDto. Field names are as HRM actually sends them
 * (confirmed against swagger + a live stage response) — NOT "name"/"id" as
 * originally guessed before S01's stage run.
 *
 * `lifecycleStatus` here is the source for Prisma `Department.isActive`
 * (S02): `HrmOrgUnit` itself has no `lifecycleStatus` field (0/436 on a live
 * sample) — it only exists on the unit's *type*, so `isActive` is derived as
 * `orgUnitTypeDto.lifecycleStatus !== "DELETED"`, one value shared by every
 * unit of that type.
 */
export interface HrmOrgUnitTypeDto {
  id?: number | null;
  orgUnitTypeName?: string | null;
  orgUnitTypeNameRu?: string | null;
  orgUnitTypeNameEn?: string | null;
  orgUnitTypeColor?: string | null;
  orgUnitManagerialLevelId?: string | null;
  lifecycleStatus?: string | null;
  isReadOnly?: boolean | null;
  isSinglePerson?: boolean | null;
  isFilterable?: boolean | null;
}

/**
 * The org-unit reference embedded in `employee.orgUnits[]` — a TRUNCATED
 * `OrgUnitDto` (confirmed live: no `orgUnitTypeDto`/`unitManagers`/
 * `reportsToOrgUnit`, just enough to resolve membership by id). Not to be
 * confused with `HrmOrgUnit` (the full shape from `GET /org-units`).
 */
export interface HrmEmployeeOrgUnitRef {
  id?: number | null;
  orgUnitName?: string | null;
  orgUnitTypeId?: number | null;
  reportsToOrgUnitTypeId?: number | null;
  reportsToId?: number | null;
  headId?: number | null;
  deputyId?: number | null;
}

/**
 * `EmployeeShortInfoDto`, as embedded in `manager`/`managerM1..M5`/`head`/
 * `employeeManagers[].manager`/etc. Deliberately partial — the real DTO also
 * carries skills maps, experience counters and profile-picture links that
 * nothing here reads.
 *
 * `email` is present on `employeeManagers[].manager` but ABSENT on the
 * top-level `manager`/`managerM1..M5`/`head` in a live sample — kept optional
 * rather than split into two types, since nothing here requires it.
 */
export interface HrmEmployeeShortInfo {
  id?: number | null;
  email?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  firstNameRu?: string | null;
  lastNameRu?: string | null;
}

/**
 * `managerType.type` on `employeeManagers[]`. Values confirmed live:
 * `STRATEGIC_HR`, `PRIMARY_RM`, `LOCAL_HR` (plus `ADDITIONAL_RM` on
 * org-units). Kept as `string` per the file's enum-widening rule.
 */
export interface HrmEmployeeManagerTypeRef {
  type?: string | null;
  typeValueId?: string | null;
}

export interface HrmEmployeeManagerEntry {
  manager?: HrmEmployeeShortInfo | null;
  managerType?: HrmEmployeeManagerTypeRef | null;
}

/**
 * Employee record from `employees/v2/search`. Rewritten in S03 against a live
 * stage run — see file header. Notably absent relative to the pre-S03 shape:
 * no `additionalInfo` (its two fields live top-level), no `dismissalStatus`/
 * `dismissalDate` (use `lifecycleStatus`/`isArchived`), no `orgUnit` singular
 * (only `orgUnits[]`, confirmed many-to-many), no `photoFileName` (HRM sends
 * a ready, short-lived signed link instead — `linkProfilePicture`).
 *
 * `projects` is kept here (for forward compatibility) even though it did not
 * appear on any of the 70 employees checked live — S03's `buildUserWrite()`
 * deliberately does not read it. See employees-search.schema.md.
 */
export interface HrmEmployee {
  id?: number | null;
  email?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  firstNameRu?: string | null;
  lastNameRu?: string | null;
  patronymicRu?: string | null;

  lifecycleStatus?: string | null;
  isArchived?: boolean | null;

  jobTitleId?: string | null;
  professionalLevelId?: string | null;
  managerialLevelId?: string | null;
  employeeStatus?: string | null;
  formatOfWork?: string | null;

  hireDate?: string | null;
  registrationDate?: string | null;
  createdDate?: string | null;
  lastModifiedDate?: string | null;

  orgUnits?: HrmEmployeeOrgUnitRef[] | null;

  manager?: HrmEmployeeShortInfo | null;
  managerM1?: HrmEmployeeShortInfo | null;
  managerM2?: HrmEmployeeShortInfo | null;
  managerM3?: HrmEmployeeShortInfo | null;
  managerM4?: HrmEmployeeShortInfo | null;
  managerM5?: HrmEmployeeShortInfo | null;
  employeeManagers?: HrmEmployeeManagerEntry[] | null;
  head?: HrmEmployeeShortInfo | null;

  linkProfilePicture?: string | null;
  linkProfilePictureMini?: string | null;

  /** Unconfirmed — see file header. Not read by buildUserWrite() in S03. */
  projects?: HrmProject[] | null;
}

/**
 * OrgUnitDto — confirmed against a live stage response (GET
 * .../org-units). Ids are numbers (Java Long), not the strings originally
 * guessed. `head`/`deputy`/`resourceManager`/`reportsTo` embed an
 * EmployeeShortInfoDto-shaped object, deliberately left as `unknown` here —
 * it's a different, richer shape than the employee-search DTO
 * (HrmEmployee) and S01 doesn't need to model it.
 *
 * No `isActive`/`lifecycleStatus` field on this type on purpose: HRM sends it
 * only on `orgUnitTypeDto.lifecycleStatus` (see `HrmOrgUnitTypeDto` above),
 * which is what Prisma `Department.isActive` (S02) is derived from.
 * `headId`/`deputyId`/`resourceManagerId` can also be absent as a key rather
 * than `null` (135/436, 135/436, 366/436 on a live sample) — read with
 * `unit.headId ?? null`, not `"headId" in unit`.
 */
export interface HrmOrgUnit {
  id?: number | null;
  orgUnitName?: string | null;
  orgUnitTypeId?: number | null;
  reportsToOrgUnitTypeId?: number | null;
  reportsToId?: number | null;
  headId?: number | null;
  deputyId?: number | null;
  resourceManagerId?: number | null;
  unitManagers?: unknown[] | null;
  orgUnitTypeDto?: HrmOrgUnitTypeDto | null;
  reportsToOrgUnit?: HrmOrgUnit | null;
  reportsTo?: unknown;
  head?: unknown;
  deputy?: unknown;
  resourceManager?: unknown;
  production?: boolean | null;
}

/**
 * Envelope of GET .../org-units (swagger: FieldsForUpdateWithDtoOrgUnitWithButtonsDto).
 * A live stage response carried units only under `data.orgUnitDtoList`, with
 * no `list` key present at all — but the swagger schema also allows a `list`
 * array of the same OrgUnitWithButtonsDto shape, so org-units.ts reads both
 * and merges by id rather than assuming only one is ever populated.
 */
export interface HrmOrgUnitWithButtonsDto {
  orgUnitDtoList?: HrmOrgUnit[] | null;
  canDelete?: boolean | null;
  canEdit?: boolean | null;
}

export interface HrmOrgUnitsListEnvelope {
  data?: HrmOrgUnitWithButtonsDto | null;
  list?: HrmOrgUnitWithButtonsDto[] | null;
  listFieldsForRead?: string[] | null;
  listFieldsForEdit?: string[] | null;
}

/**
 * `GET /api/dictionaries/api/v2/dictionaries` — confirmed against swagger.
 * Real shape is an array of dictionaries (one per name, e.g.
 * "professionalLevel"), each carrying its own `values[]`, and the per-language
 * translation lives NESTED under `values[].translations[]` — not flat, as
 * originally assumed from the integration doc before the stage run.
 *
 * `values[].value` is the value's stable CODE (e.g. `"JUNIOR_MINUS"`), as
 * opposed to `values[].translations[].translation`, which is locale text
 * (e.g. `"Junior -"`) — confirmed live against `dictionaries.raw.json`. S03's
 * grade mapping keys off `value`, not `translation`.
 */
export interface HrmDictionaryValueTranslation {
  id?: string | null;
  languageId?: string | null;
  translation?: string | null;
  valueId?: string | null;
  parentId?: string | null;
  value?: string | null;
  orderValue?: number | null;
  lifecycleStatus?: string | null;
}

export interface HrmDictionaryValue {
  id?: string | null;
  value?: string | null;
  dictionaryId?: string | null;
  parentId?: string | null;
  orderValue?: number | null;
  translations?: HrmDictionaryValueTranslation[] | null;
  lifecycleStatus?: string | null;
}

export interface HrmDictionaryDto {
  id?: string | null;
  name?: string | null;
  values?: HrmDictionaryValue[] | null;
  /** Translations of the dictionary's own display name, not of its values. */
  translations?: HrmDictionaryValueTranslation[] | null;
  canBeDynamicallyUpdated?: boolean | null;
}

export type HrmDictionaryResponse = HrmDictionaryDto[];

/** Spring `Page<T>` envelope, as seen on some HRM list endpoints. */
export interface HrmSpringPage<T> {
  content?: T[] | null;
  totalPages?: number | null;
  totalElements?: number | null;
  size?: number | null;
  number?: number | null;
}

export type HrmPagedBody<T> = HrmSpringPage<T> | T[];

export interface HrmPage<T> {
  items: T[];
  totalPages: number;
  totalElements: number | null;
}

export interface HrmFileTokenResponse {
  fileToken?: string | null;
  token?: string | null;
  expirationDate?: string | number | null;
}

export const HRM_DICTIONARY_NAMES = [
  "professionalLevel",
  "jobTitle",
  "employeeStatus",
] as const;
