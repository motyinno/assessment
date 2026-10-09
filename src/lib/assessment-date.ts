/**
 * The date the assessments list shows. `Assessment.scheduledAt` is only filled
 * by the manual "New assessment" form, never by the request flow that creates
 * most assessments, so it can't be the source. In order of usefulness:
 * when it was completed, the next booked meeting, a manually set date,
 * and finally when it was created (always present).
 */
export type AssessmentDateKind = "completed" | "meeting" | "scheduled" | "created";

interface DateInput {
  status: string;
  completedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  sessions: Array<{ meetingScheduledAt: string | null; status: string }>;
}

export function assessmentDisplayDate(a: DateInput, now = Date.now()): { date: string; kind: AssessmentDateKind } {
  if (a.status === "COMPLETED" && a.completedAt) return { date: a.completedAt, kind: "completed" };

  // Open meetings only: a finished stage's meeting is history, not "next".
  if (a.status !== "CANCELLED") {
    const meetings = a.sessions
      .filter((s) => s.meetingScheduledAt && s.status !== "COMPLETED")
      .map((s) => s.meetingScheduledAt as string)
      .sort();
    // Soonest meeting that hasn't happened yet; if all are past (overdue), the latest.
    const next = meetings.find((m) => new Date(m).getTime() >= now) ?? meetings[meetings.length - 1];
    if (next) return { date: next, kind: "meeting" };
  }

  if (a.scheduledAt) return { date: a.scheduledAt, kind: "scheduled" };
  return { date: a.createdAt, kind: "created" };
}
