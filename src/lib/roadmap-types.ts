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
  manualDone: Record<Grade, boolean>;
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
