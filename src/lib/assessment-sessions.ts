export const SESSION_TYPES = {
  TECHNICAL_1: "TECHNICAL_1",
  TECHNICAL_2: "TECHNICAL_2",
  TECHNICAL_3: "TECHNICAL_3",
  PDP_TECH: "PDP_TECH",
} as const;

export const SESSION_STATUSES = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
} as const;

export const ASSESSMENT_TYPES = {
  GENERAL: "GENERAL",
  PDP_CHECK: "PDP_CHECK",
} as const;

export const ASSESSMENT_TYPE_LABELS: Record<string, string> = {
  GENERAL: "General assessment",
  PDP_CHECK: "PDP review",
};

export const SESSION_TYPE_LABELS: Record<string, string> = {
  TECHNICAL_1: "Technical 1",
  TECHNICAL_2: "Technical 2",
  TECHNICAL_3: "Technical 3",
  PDP_TECH: "PDP review",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
};

import { baseGrade } from "./grades";

export interface SessionTemplate {
  type: string;
  title: string | null;
  status: string;
  order: number;
  durationMin: number;
}

/**
 * Hardcoded fallback used when no admin-defined SessionTemplate rows exist for
 * the given (gradeBand, assessmentType). Mirrors the original behaviour:
 * - GENERAL: 2 technical sessions (jun) or 3 (mid/sen).
 * - PDP_CHECK: single 1-hour tech session (PDP_TECH).
 */
export function buildDefaultSessions(
  grade: string,
  assessmentType: string = ASSESSMENT_TYPES.GENERAL
): SessionTemplate[] {
  const mk = (type: string, order: number): SessionTemplate => ({
    type,
    title: SESSION_TYPE_LABELS[type] ?? type,
    status: SESSION_STATUSES.NOT_STARTED,
    order,
    durationMin: 60,
  });

  if (assessmentType === ASSESSMENT_TYPES.PDP_CHECK) {
    return [mk(SESSION_TYPES.PDP_TECH, 0)];
  }

  const sessions: SessionTemplate[] = [
    mk(SESSION_TYPES.TECHNICAL_1, 0),
    mk(SESSION_TYPES.TECHNICAL_2, 1),
  ];

  // Mid and Sen get a 3rd technical session (grade may be "mid-", "mid+", etc.)
  const base = baseGrade(grade);
  if (base === "mid" || base === "sen") {
    sessions.push(mk(SESSION_TYPES.TECHNICAL_3, 2));
  }

  return sessions;
}

/**
 * Build session templates for a given grade and assessment type. Reads the
 * admin-managed SessionTemplate rows for the resolved grade band; falls back to
 * {@link buildDefaultSessions} when none are configured.
 */
export async function buildSessionsForGrade(
  grade: string,
  assessmentType: string = ASSESSMENT_TYPES.GENERAL
): Promise<SessionTemplate[]> {
  // Dynamic import keeps this module client-safe: the label constants above are
  // imported by client components, but Prisma must never reach the browser.
  const { default: prisma } = await import("./prisma");
  const gradeBand = baseGrade(grade);
  const rows = await prisma.sessionTemplate.findMany({
    where: {
      assessmentType: assessmentType as "GENERAL" | "PDP_CHECK",
      gradeBand,
      enabled: true,
    },
    orderBy: { order: "asc" },
  });

  if (rows.length === 0) {
    return buildDefaultSessions(grade, assessmentType);
  }

  // Re-sequence order contiguously (0,1,2,…). Templates keep their own `order`
  // for admin sorting, but disabling one must not leave a gap in the generated
  // sessions — otherwise the assessment page numbers them 1, 3, 4 instead of
  // 1, 2, 3 (it renders `session.order + 1`).
  return rows.map((r, idx) => ({
    type: r.key,
    title: r.title,
    status: SESSION_STATUSES.NOT_STARTED,
    order: idx,
    durationMin: r.durationMin,
  }));
}
