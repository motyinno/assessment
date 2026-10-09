import { describe, expect, it } from "vitest";
import { assessmentDisplayDate } from "@/lib/assessment-date";

const base = {
  status: "PLANNED",
  completedAt: null,
  scheduledAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  sessions: [] as Array<{ meetingScheduledAt: string | null; status: string }>,
};
const now = new Date("2026-06-01T00:00:00.000Z").getTime();

describe("assessmentDisplayDate", () => {
  it("uses completedAt for a completed assessment", () => {
    expect(assessmentDisplayDate({ ...base, status: "COMPLETED", completedAt: "2026-05-05T00:00:00.000Z" }, now)).toEqual({
      date: "2026-05-05T00:00:00.000Z",
      kind: "completed",
    });
  });

  it("picks the soonest upcoming open meeting", () => {
    const r = assessmentDisplayDate(
      {
        ...base,
        sessions: [
          { meetingScheduledAt: "2026-07-10T00:00:00.000Z", status: "NOT_STARTED" },
          { meetingScheduledAt: "2026-06-20T00:00:00.000Z", status: "NOT_STARTED" },
          { meetingScheduledAt: "2026-05-01T00:00:00.000Z", status: "COMPLETED" },
        ],
      },
      now
    );
    expect(r).toEqual({ date: "2026-06-20T00:00:00.000Z", kind: "meeting" });
  });

  it("falls back to the latest overdue meeting when none is upcoming", () => {
    const r = assessmentDisplayDate(
      {
        ...base,
        sessions: [
          { meetingScheduledAt: "2026-03-01T00:00:00.000Z", status: "NOT_STARTED" },
          { meetingScheduledAt: "2026-04-01T00:00:00.000Z", status: "NOT_STARTED" },
        ],
      },
      now
    );
    expect(r.date).toBe("2026-04-01T00:00:00.000Z");
  });

  it("ignores meetings of a cancelled assessment", () => {
    const r = assessmentDisplayDate(
      { ...base, status: "CANCELLED", sessions: [{ meetingScheduledAt: "2026-07-01T00:00:00.000Z", status: "NOT_STARTED" }] },
      now
    );
    expect(r).toEqual({ date: base.createdAt, kind: "created" });
  });

  it("uses a manual scheduledAt, then createdAt", () => {
    expect(assessmentDisplayDate({ ...base, scheduledAt: "2026-09-09T00:00:00.000Z" }, now).kind).toBe("scheduled");
    expect(assessmentDisplayDate(base, now)).toEqual({ date: base.createdAt, kind: "created" });
  });
});
