import { describe, expect, it } from "vitest";
import {
  buildGradeTimeline,
  formatDuration,
  type GradeChangeRecord,
} from "@/lib/grade-history";

const NOW = new Date("2026-09-17T00:00:00.000Z");

function record(over: Partial<GradeChangeRecord> = {}): GradeChangeRecord {
  return {
    id: "r1",
    previousGrade: "jun",
    newGrade: "jun+",
    source: "ASSESSMENT",
    assessmentId: "a1",
    assessmentTitle: "Junior review",
    actorName: "Admin",
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("buildGradeTimeline", () => {
  it("returns an empty timeline when there is no history", () => {
    const t = buildGradeTimeline([], "mid", NOW);
    expect(t.events).toEqual([]);
    expect(t.currentGrade).toBe("mid");
    expect(t.currentGradeLabel).toBe("Middle");
    expect(t.startingGrade).toBeNull();
    expect(t.promotions).toBe(0);
    expect(t.daysAtCurrentGrade).toBeNull();
  });

  it("orders events newest first regardless of input order", () => {
    const t = buildGradeTimeline(
      [
        record({ id: "b", createdAt: "2026-05-01T00:00:00.000Z", previousGrade: "jun+", newGrade: "mid" }),
        record({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
        record({ id: "c", createdAt: "2026-08-01T00:00:00.000Z", previousGrade: "mid", newGrade: "mid+" }),
      ],
      "mid+",
      NOW
    );
    expect(t.events.map((e) => e.id)).toEqual(["c", "b", "a"]);
  });

  it("infers the starting grade from the earliest change", () => {
    const t = buildGradeTimeline(
      [
        record({ id: "b", createdAt: "2026-05-01T00:00:00.000Z", previousGrade: "jun+", newGrade: "mid" }),
        record({ id: "a", createdAt: "2026-01-01T00:00:00.000Z", previousGrade: "jun", newGrade: "jun+" }),
      ],
      "mid",
      NOW
    );
    expect(t.startingGrade).toBe("jun");
    expect(t.startingGradeLabel).toBe("Junior");
  });

  it("classifies direction by grade rank, not string comparison", () => {
    const up = buildGradeTimeline([record({ previousGrade: "jun+", newGrade: "mid-" })], "mid-", NOW);
    expect(up.events[0].direction).toBe("up");

    const down = buildGradeTimeline([record({ previousGrade: "sen", newGrade: "mid+" })], "mid+", NOW);
    expect(down.events[0].direction).toBe("down");

    const set = buildGradeTimeline([record({ previousGrade: null, newGrade: "jun" })], "jun", NOW);
    expect(set.events[0].direction).toBe("set");

    const cleared = buildGradeTimeline([record({ previousGrade: "jun", newGrade: null })], null, NOW);
    expect(cleared.events[0].direction).toBe("cleared");
  });

  it("treats an unrankable grade string as a plain set rather than guessing", () => {
    const t = buildGradeTimeline(
      [record({ previousGrade: "principal", newGrade: "sen" })],
      "sen",
      NOW
    );
    expect(t.events[0].direction).toBe("set");
  });

  it("counts only upward moves as promotions", () => {
    const t = buildGradeTimeline(
      [
        record({ id: "a", createdAt: "2026-01-01T00:00:00.000Z", previousGrade: "jun", newGrade: "jun+" }),
        record({ id: "b", createdAt: "2026-02-01T00:00:00.000Z", previousGrade: "jun+", newGrade: "jun" }),
        record({ id: "c", createdAt: "2026-03-01T00:00:00.000Z", previousGrade: "jun", newGrade: "mid" }),
      ],
      "mid",
      NOW
    );
    expect(t.promotions).toBe(2);
  });

  it("measures time at the previous grade between consecutive changes", () => {
    const t = buildGradeTimeline(
      [
        record({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
        record({ id: "b", createdAt: "2026-01-31T00:00:00.000Z", previousGrade: "jun+", newGrade: "mid" }),
      ],
      "mid",
      NOW
    );
    const [newest, oldest] = t.events;
    expect(newest.daysAtPreviousGrade).toBe(30);
    // Nothing records when the earliest grade was reached.
    expect(oldest.daysAtPreviousGrade).toBeNull();
  });

  it("measures days at the current grade from the most recent change", () => {
    const t = buildGradeTimeline(
      [record({ createdAt: "2026-09-07T00:00:00.000Z" })],
      "jun+",
      NOW
    );
    expect(t.daysAtCurrentGrade).toBe(10);
  });

  it("narrows an unexpected source to MANUAL", () => {
    const t = buildGradeTimeline([record({ source: "HRM_SYNC" })], "jun+", NOW);
    expect(t.events[0].source).toBe("MANUAL");
  });

  it("does not mutate the caller's array", () => {
    const input = [
      record({ id: "b", createdAt: "2026-05-01T00:00:00.000Z" }),
      record({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    buildGradeTimeline(input, "mid", NOW);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("formatDuration", () => {
  it("returns null for unknown durations", () => {
    expect(formatDuration(null)).toBeNull();
  });

  it("uses days below a month", () => {
    expect(formatDuration(0)).toBe("0d");
    expect(formatDuration(30)).toBe("30d");
  });

  it("uses months below a year", () => {
    expect(formatDuration(31)).toBe("1m");
    expect(formatDuration(180)).toBe("6m");
  });

  it("uses years, dropping a zero month remainder", () => {
    expect(formatDuration(365)).toBe("1y");
    expect(formatDuration(430)).toBe("1y 2m");
  });
});
