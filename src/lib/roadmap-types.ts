import type { Grade } from "@/lib/types";

/**
 * Client-safe roadmap types + presentation metadata. Kept free of server-only
 * imports (prisma, fs) so both the server builder (lib/roadmap.ts) and the
 * client components can import from here.
 */

export type RoadmapStatus =
  | "not-started"
  | "in-progress"
  | "assessed"
  | "mastered";

export interface RoadmapTopicDTO {
  id: string;
  title: string;
  skills: Record<Grade, string[]>;
  status: Record<Grade, RoadmapStatus>;
  /**
   * Resolved assessment score (0-10) per grade band — a score only fills the
   * band it was assessed at (assessor-first, self-assessment fallback). A
   * Junior assessment never sets the mid/sen score.
   */
  scores: Record<Grade, number | null>;
  /**
   * The individual skill strings the user has ticked off per band (already
   * intersected with the current skill list). `resolvedSkills[band].length`
   * out of `skills[band].length` gives the per-question progress.
   */
  resolvedSkills: Record<Grade, string[]>;
}

export interface RoadmapSectionDTO {
  id: string;
  title: string;
  topics: RoadmapTopicDTO[];
}

export interface RoadmapDTO {
  sections: RoadmapSectionDTO[];
  currentGrade: Grade;
  /** The band the user is progressing toward; null when already at senior. */
  nextGrade: Grade | null;
}

export const BANDS: Grade[] = ["jun", "mid", "sen"];

export const BAND_LABELS: Record<Grade, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

export const BAND_SHORT: Record<Grade, string> = {
  jun: "J",
  mid: "M",
  sen: "S",
};

/** Presentation metadata for each status, orthogonal to per-section colors. */
export interface StatusMeta {
  label: string;
  /** Solid dot / node fill classes. */
  dot: string;
  /** Soft badge/pill classes (bg tint + text). */
  badge: string;
  /** SVG stroke color for connector lines. */
  stroke: string;
}

export const STATUS_META: Record<RoadmapStatus, StatusMeta> = {
  "not-started": {
    label: "Not started",
    dot: "bg-muted border-border text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
    stroke: "var(--color-border)",
  },
  "in-progress": {
    label: "In progress",
    dot: "bg-amber-500 border-amber-600 text-white",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    stroke: "var(--color-amber-500)",
  },
  assessed: {
    label: "Assessed",
    dot: "bg-blue-500 border-blue-600 text-white",
    badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    stroke: "var(--color-blue-500)",
  },
  mastered: {
    label: "Mastered",
    dot: "bg-emerald-500 border-emerald-600 text-white",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    stroke: "var(--color-emerald-500)",
  },
};

export const STATUS_ORDER: RoadmapStatus[] = [
  "not-started",
  "in-progress",
  "assessed",
  "mastered",
];

/** Score at/above which an assessed topic is "mastered"; scores are 0-10. */
export const MASTERY_THRESHOLD = 8;
/** Score at/above which a topic counts as "assessed" (touched, not mastered). */
export const ASSESSED_THRESHOLD = 4;

export function statusRank(s: RoadmapStatus): number {
  return STATUS_ORDER.indexOf(s);
}

/** Status implied by an assessment score alone. */
export function scoreStatus(score: number | null): RoadmapStatus {
  if (score === null) return "not-started";
  if (score >= MASTERY_THRESHOLD) return "mastered";
  if (score >= ASSESSED_THRESHOLD) return "assessed";
  return "in-progress";
}

/** Status implied by ticked questions alone: all → mastered, some → in-progress. */
export function manualStatus(resolvedCount: number, total: number): RoadmapStatus {
  if (total > 0 && resolvedCount >= total) return "mastered";
  if (resolvedCount > 0) return "in-progress";
  return "not-started";
}

/**
 * Combine assessment score and ticked-question progress into one status —
 * whichever is further along wins. Shared by the server builder and the
 * client's optimistic update so they never diverge.
 */
export function combineStatus(
  score: number | null,
  resolvedCount: number,
  total: number
): RoadmapStatus {
  const a = scoreStatus(score);
  const b = manualStatus(resolvedCount, total);
  return statusRank(a) >= statusRank(b) ? a : b;
}

/**
 * Questions counted as resolved for display — a topic mastered by assessment
 * reads as fully resolved (total/total) so the count never contradicts a
 * "Mastered" badge; otherwise it's the number of ticked questions.
 */
export function effectiveResolved(
  status: RoadmapStatus,
  resolvedCount: number,
  total: number
): number {
  return status === "mastered" ? total : resolvedCount;
}
