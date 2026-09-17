import { gradeRank, gradeLabel } from "@/lib/grades";

/**
 * A person's grade history — the "Growth history" card on the profile and user
 * detail pages.
 *
 * Kept pure (no Prisma import) so the whole shape can be unit-tested: the
 * ordering, the promotion/demotion classification and the time-at-grade maths
 * are where the bugs would live, not in the query that feeds them.
 */

/** One `GradeAuditLog` row, flattened for the client. */
export interface GradeChangeRecord {
  id: string;
  previousGrade: string | null;
  newGrade: string | null;
  /** "ASSESSMENT" | "MANUAL" — free-form in the DB, narrowed on the way out. */
  source: string;
  assessmentId: string | null;
  assessmentTitle: string | null;
  actorName: string | null;
  note: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

export type GradeChangeDirection = "up" | "down" | "set" | "cleared";
export type GradeChangeSource = "ASSESSMENT" | "MANUAL";

export interface GradeTimelineEvent {
  id: string;
  previousGrade: string | null;
  newGrade: string | null;
  previousGradeLabel: string;
  newGradeLabel: string;
  direction: GradeChangeDirection;
  source: GradeChangeSource;
  assessmentId: string | null;
  assessmentTitle: string | null;
  actorName: string | null;
  note: string | null;
  at: string;
  /**
   * Days spent at `previousGrade` before this change. Null for the earliest
   * event — nothing records when that grade was reached, and inferring it from
   * `User.createdAt` would be wrong for anyone imported by the HRM sync.
   */
  daysAtPreviousGrade: number | null;
}

export interface GradeTimeline {
  currentGrade: string | null;
  currentGradeLabel: string;
  /**
   * Where the person started, inferred from the earliest recorded change.
   * Null when there is no history at all, or when the earliest change had no
   * previous grade (i.e. the grade was set for the first time).
   */
  startingGrade: string | null;
  startingGradeLabel: string;
  /** Newest first — the order the UI renders. */
  events: GradeTimelineEvent[];
  /** How many of the events were a move up the ladder. */
  promotions: number;
  /** Days since the most recent change; null when there is no history. */
  daysAtCurrentGrade: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function classify(
  previousGrade: string | null,
  newGrade: string | null
): GradeChangeDirection {
  if (newGrade === null) return "cleared";
  if (previousGrade === null) return "set";
  const from = gradeRank(previousGrade);
  const to = gradeRank(newGrade);
  // An unknown grade string ranks -1; treat "can't compare" as a plain set
  // rather than inventing a direction from it.
  if (from < 0 || to < 0) return "set";
  if (to > from) return "up";
  if (to < from) return "down";
  return "set";
}

function daysBetween(earlier: number, later: number): number {
  return Math.max(0, Math.floor((later - earlier) / DAY_MS));
}

function narrowSource(source: string): GradeChangeSource {
  return source === "ASSESSMENT" ? "ASSESSMENT" : "MANUAL";
}

/**
 * Turn raw audit rows into the timeline the UI renders.
 *
 * `records` may arrive in any order — they're sorted here by `createdAt` so a
 * caller's `orderBy` can never change the meaning of `daysAtPreviousGrade`.
 * `now` is injectable for tests.
 */
export function buildGradeTimeline(
  records: GradeChangeRecord[],
  currentGrade: string | null,
  now: Date = new Date()
): GradeTimeline {
  // Oldest first while we compute durations, reversed for output.
  const ordered = [...records].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );

  const oldestFirst: GradeTimelineEvent[] = ordered.map((r, i) => {
    const at = Date.parse(r.createdAt);
    const previousAt = i > 0 ? Date.parse(ordered[i - 1].createdAt) : null;
    return {
      id: r.id,
      previousGrade: r.previousGrade,
      newGrade: r.newGrade,
      previousGradeLabel: gradeLabel(r.previousGrade),
      newGradeLabel: gradeLabel(r.newGrade),
      direction: classify(r.previousGrade, r.newGrade),
      source: narrowSource(r.source),
      assessmentId: r.assessmentId,
      assessmentTitle: r.assessmentTitle,
      actorName: r.actorName,
      note: r.note,
      at: r.createdAt,
      daysAtPreviousGrade:
        previousAt === null ? null : daysBetween(previousAt, at),
    };
  });

  const latest = oldestFirst[oldestFirst.length - 1] ?? null;
  const earliest = oldestFirst[0] ?? null;

  const promotions = oldestFirst.filter((e) => e.direction === "up").length;

  return {
    currentGrade,
    currentGradeLabel: gradeLabel(currentGrade),
    startingGrade: earliest?.previousGrade ?? null,
    startingGradeLabel: gradeLabel(earliest?.previousGrade ?? null),
    // Copy before reversing — `oldestFirst` must stay oldest-first for anything
    // computed after this point.
    events: [...oldestFirst].reverse(),
    promotions,
    daysAtCurrentGrade: latest
      ? daysBetween(Date.parse(latest.at), now.getTime())
      : null,
  };
}

/**
 * "1y 2m" / "3m" / "12d" — compact time-at-grade for the timeline. Returns
 * null for a null input so callers can skip the label entirely.
 */
export function formatDuration(days: number | null): string | null {
  if (days === null) return null;
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months}m`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years}y` : `${years}y ${rest}m`;
}
