/**
 * Base grade — collapses the +/- modifiers from `lib/grades.ts` into the
 * three buckets that drive matrix lookups and session templates.
 */
export type Grade = "jun" | "mid" | "sen";

export interface PdpTopic {
  questions: string[];
  task: string;
}

export type PdpTopicsMap = Record<string, PdpTopic>;
export type TopicMapping = Record<string, string[]>;

// Tech Matrix types
export interface TechMatrixTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}

export interface TechMatrixSection {
  id: string;
  title: string;
  topics: TechMatrixTopic[];
}

export interface TechMatrix {
  sections: TechMatrixSection[];
}

// ---- People / HRM-sourced user fields (S09) ----
//
// Shared shape for the fields HRM sync (S02-S04) adds to `User`. Kept in one
// place and imported rather than copied into every page's local `User`
// interface a third time (see S09 spec, "Type changes").

export interface DepartmentRef {
  id: string;
  name: string;
  /** HRM org level ("Unit" / "Division" / "Department" / "Team" / "Group" / "Person") — see HRM_ORG_UNIT_TYPES. */
  typeName?: string | null;
}

export interface ManagerRef {
  id: string;
  name: string;
  email: string;
}

/** Fields every people-facing page needs beyond the pre-HRM `User` shape. */
export interface HrmUserFields {
  jobTitle: string | null;
  projects: string[];
  photoFileName: string | null;
  isArchived: boolean;
  hrmEmployeeId: number | null;
  /** All units the person belongs to, `isFilterable: false` ones excluded (08 §9). */
  departments: DepartmentRef[];
  /** The Division slot of `departments`, denormalized by the sync — what people are split by. */
  division: DepartmentRef | null;
  // "Position in the company", straight from HRM — see the User model.
  professionalLevel: string | null;
  managerialLevel: string | null;
  isMentor: boolean;
  isDeliveryCoordinator: boolean;
}

/** One rung of the M1..M5 "Managerial structure" card. */
export interface ManagerLinkRef {
  level: number;
  manager: { id: string; name: string } | null;
}
