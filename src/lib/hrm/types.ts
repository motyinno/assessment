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

export interface HrmOrgUnitTypeDto {
  id?: string | null;
  name?: string | null;
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

export interface HrmOrgUnit {
  id?: string | null;
  name?: string | null;
  orgUnitType?: HrmOrgUnitTypeDto | null;
  reportsToOrgUnit?: HrmOrgUnit | null;
  headEmployeeId?: string | null;
}

export interface HrmDictionaryEntry {
  valueId?: string | null;
  translation?: string | null;
  languageId?: string | null;
  orderValue?: number | null;
  [key: string]: unknown;
}

export type HrmDictionaryResponse = Record<string, HrmDictionaryEntry[] | undefined>;

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
