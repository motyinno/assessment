/**
 * Wire types for the HRM API. Deliberately WIDE: every field optional, every
 * field nullable wherever HRM might send `null`, every enum-shaped field kept
 * as `string`. The `employees/v2/search` response schema in the HRM doc
 * (HRM-Integration-nodeassm.md §1.1) is assembled from fields mentioned along
 * the way, not from one full 200 response — the doc says so explicitly.
 * `dismissalStatus: "ACTUAL" | "DELETED"` would mean a seventh value HRM adds
 * later breaks `npm run build`; known values live as constants
 * (HRM_DISMISSAL_ACTUAL, HRM_LIFECYCLE_DELETED) while the field type stays
 * `string | null`.
 *
 * Growth rule: fields get added as S04's exploratory run finds them. None of
 * them become required.
 *
 * No index signature (`[key: string]: unknown`) on HrmEmployee — tempting
 * given the known-incomplete schema, but it turns a typo like
 * `emp.firtNameEn` from a compile error into `unknown`, which then survives
 * typecheck and shows up silently as an empty field after `?? ""`. That's
 * exactly the class of bug that's most expensive here. S04's exploration,
 * which needs the unmodeled remainder, can take the raw body as `unknown` in
 * one place instead.
 *
 * Dates are `string | null` (ISO), never `Date` — this is raw JSON.
 *
 * Zero imports, so both S03's tests and any future client component can pull
 * these in freely (same approach as src/lib/roadmap-types.ts).
 */

export const HRM_DISMISSAL_ACTUAL = "ACTUAL";
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

export interface HrmEmployeeOrgUnit {
  id?: string | null;
  name?: string | null;
  orgUnitType?: HrmOrgUnitTypeDto | null;
}

export interface HrmEmployeeManagerRef {
  id?: string | null;
  email?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
}

export interface HrmEmployeeAdditionalInfo {
  professionalLevelId?: string | null;
  jobTitleId?: string | null;
  [key: string]: unknown;
}

export interface HrmEmployee {
  id?: string | null;
  email?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
  firstNameRu?: string | null;
  lastNameRu?: string | null;
  dismissalStatus?: string | null;
  lifecycleStatus?: string | null;
  photoFileName?: string | null;
  orgUnit?: HrmEmployeeOrgUnit | null;
  manager?: HrmEmployeeManagerRef | null;
  projects?: HrmProject[] | null;
  additionalInfo?: HrmEmployeeAdditionalInfo | null;
  hireDate?: string | null;
  dismissalDate?: string | null;
  updatedAt?: string | null;
}

/**
 * OrgUnitDto — confirmed against a live stage response (GET
 * .../org-units). Ids are numbers (Java Long), not the strings originally
 * guessed. `head`/`deputy`/`resourceManager`/`reportsTo` embed an
 * EmployeeShortInfoDto-shaped object, deliberately left as `unknown` here —
 * it's a different, richer shape than the employee-search DTO
 * (HrmEmployee) and S01 doesn't need to model it.
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
