export const SESSION_TYPES = {
  SOFT_AI: "SOFT_AI",
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
  GENERAL: "Общий ассессмент",
  PDP_CHECK: "Проверка ИПР",
};

export const SESSION_TYPE_LABELS: Record<string, string> = {
  SOFT_AI: "Soft + AI",
  TECHNICAL_1: "Техническая 1",
  TECHNICAL_2: "Техническая 2",
  TECHNICAL_3: "Техническая 3",
  PDP_TECH: "Проверка ИПР",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Не начата",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершена",
  SKIPPED: "Пропущена",
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
 * - GENERAL: SOFT_AI (SKIPPED if already passed) + 2 tech sessions (jun) or 3 (mid/sen).
 * - PDP_CHECK: single 1-hour tech session (PDP_TECH).
 */
export function buildSessionsForGrade(
  grade: string,
  softAiInterviewPassed: boolean,
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
      type: SESSION_TYPES.SOFT_AI,
      status: softAiInterviewPassed ? SESSION_STATUSES.SKIPPED : SESSION_STATUSES.NOT_STARTED,
      order: 0,
      durationMin: 60,
    },
    {
      type: SESSION_TYPES.TECHNICAL_1,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 1,
      durationMin: 60,
    },
    {
      type: SESSION_TYPES.TECHNICAL_2,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 2,
      durationMin: 60,
    },
  ];

  // Mid and Sen get a 3rd technical session (grade may be "mid-", "mid+", etc.)
  const base = baseGrade(grade);
  if (base === "mid" || base === "sen") {
    sessions.push({
      type: SESSION_TYPES.TECHNICAL_3,
      status: SESSION_STATUSES.NOT_STARTED,
      order: 3,
      durationMin: 60,
    });
  }

  return sessions;
}

/**
 * Get total planned hours for an assessment.
 */
export function getTotalHours(
  grade: string,
  softAiSkipped: boolean,
  assessmentType: string = ASSESSMENT_TYPES.GENERAL
): number {
  if (assessmentType === ASSESSMENT_TYPES.PDP_CHECK) return 1;
  const techHours = baseGrade(grade) === "jun" ? 2 : 3;
  return techHours + (softAiSkipped ? 0 : 1);
}
