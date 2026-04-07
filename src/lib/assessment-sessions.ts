export const SESSION_TYPES = {
  SOFT_AI: "SOFT_AI",
  TECHNICAL_1: "TECHNICAL_1",
  TECHNICAL_2: "TECHNICAL_2",
  TECHNICAL_3: "TECHNICAL_3",
} as const;

export const SESSION_STATUSES = {
  NOT_STARTED: "NOT_STARTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  SKIPPED: "SKIPPED",
} as const;

export const SESSION_TYPE_LABELS: Record<string, string> = {
  SOFT_AI: "Soft + AI",
  TECHNICAL_1: "Техническая 1",
  TECHNICAL_2: "Техническая 2",
  TECHNICAL_3: "Техническая 3",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Не начата",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершена",
  SKIPPED: "Пропущена",
};

export interface SessionTemplate {
  type: string;
  status: string;
  order: number;
  durationMin: number;
}

/**
 * Build session templates for a given grade.
 * If softAiInterviewPassed, the SOFT_AI session is created as SKIPPED.
 */
export function buildSessionsForGrade(
  grade: string,
  softAiInterviewPassed: boolean
): SessionTemplate[] {
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

  // Mid and Sen get a 3rd technical session
  if (grade === "mid" || grade === "sen") {
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
export function getTotalHours(grade: string, softAiSkipped: boolean): number {
  const techHours = grade === "jun" ? 2 : 3;
  return techHours + (softAiSkipped ? 0 : 1);
}
