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
  status: string;
  order: number;
  durationMin: number;
}

/**
 * Build session templates for a given grade and assessment type.
 * - GENERAL: 2 technical sessions (jun) or 3 (mid/sen).
 * - PDP_CHECK: single 1-hour tech session (PDP_TECH).
 */
export function buildSessionsForGrade(
  grade: string,
  assessmentType: string = ASSESSMENT_TYPES.GENERAL
): SessionTemplate[] {
  if (assessmentType === ASSESSMENT_TYPES.PDP_CHECK) {
    return [
      {
        type: SESSION_TYPES.PDP_TECH,
        status: SESSION_STATUSES.NOT_STARTED,
        order: 0,
        durationMin: 60,
      },
    ];
  }

  const sessions: SessionTemplate[] = [
    {
      type: SESSION_TYPES.TECHNICAL_1,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 0,
      durationMin: 60,
    },
    {
      type: SESSION_TYPES.TECHNICAL_2,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 1,
      durationMin: 60,
    },
  ];

  // Mid and Sen get a 3rd technical session (grade may be "mid-", "mid+", etc.)
  const base = baseGrade(grade);
  if (base === "mid" || base === "sen") {
    sessions.push({
      type: SESSION_TYPES.TECHNICAL_3,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 2,
      durationMin: 60,
    });
  }

  return sessions;
}
