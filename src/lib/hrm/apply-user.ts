/**
 * The field policy (see plan §"Field policy"), implemented as one pure
 * function. Both the nightly sync (S04) and the login-time refresh
 * (refresh-user.ts) must call THIS function to decide what to write —
 * duplicating the rule in two places is exactly the failure mode the plan
 * calls out.
 *
 * Pure: no Prisma import, no network. Input is data (+ existing row, if any);
 * output is a plain object shaped for `prisma.user.create`/`.update`. The
 * caller owns the actual query (and, for create, generating the membership
 * rows / role — this function never touches `role`).
 */
import type { Grade } from "@/lib/grades";
import type { MappedEmployee } from "@/lib/hrm/mapping";

/** The only field of the existing local row this policy needs to see. */
export interface ExistingUserForHrm {
  grade: string | null;
}

interface UserWriteCommon {
  name: string;
  jobTitle: string | null;
  hrmEmployeeId: number;
  hrmManagerId: number | null;
  hrmSyncedAt: Date;
  hrmDismissed: boolean;
  isArchived: boolean;
  grade?: Grade | null;
  photoFileName: string | null;
}

export interface UserCreateWrite extends UserWriteCommon {
  email: string;
  grade: Grade | null;
}

export interface UserWrite {
  create?: UserCreateWrite;
  update?: UserWriteCommon;
}

function isGradeEmpty(grade: string | null | undefined): boolean {
  return grade === null || grade === undefined || grade === "";
}

/**
 * `mapped` is the output of `mapEmployee()`. `existing` is `null` for a
 * brand-new person, or the current row's `grade` for someone already synced.
 * `now` defaults to `new Date()` but can be passed explicitly by tests.
 *
 * Deliberately absent from both `create` and `update`, by policy (see plan
 * table): `email` in `update` (never changes after creation), `role` (S05
 * owns it), `projects` (not written in S03 — see
 * hrm-payloads/employees-search.schema.md), `managerId` (resolved in a
 * second pass, S04 — only the raw `hrmManagerId` is written here).
 * `photoFileName` IS written here, always (HRM-owned, like `jobTitle` —
 * see S12 plan).
 */
export function buildUserWrite(
  mapped: MappedEmployee,
  existing: ExistingUserForHrm | null,
  now: Date = new Date()
): UserWrite {
  const common: UserWriteCommon = {
    name: mapped.name,
    jobTitle: mapped.jobTitle,
    hrmEmployeeId: mapped.hrmEmployeeId,
    hrmManagerId: mapped.hrmManagerId,
    hrmSyncedAt: now,
    hrmDismissed: mapped.hrmDismissed,
    isArchived: mapped.isArchived,
    photoFileName: mapped.photoFileName,
  };

  if (existing === null) {
    // A brand-new row has no local grade to protect — HRM's grade always
    // lands, even when it's null (nothing to protect it from).
    return {
      create: {
        ...common,
        email: mapped.email,
        grade: mapped.grade,
      },
    };
  }

  const update: UserWriteCommon = { ...common };
  if (isGradeEmpty(existing.grade)) {
    update.grade = mapped.grade;
  }
  // else: existing.grade is non-empty -> `grade` key stays absent from
  // `update` entirely. This is the one rule the whole file exists to enforce.

  return { update };
}
