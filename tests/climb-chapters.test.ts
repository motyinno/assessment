import { describe, expect, it } from "vitest";
import {
  HIGH_CAMP,
  buildChapterLog,
  legPosition,
  monthsBetween,
  readinessFor,
  summitPush,
  type ChapterAssessment,
  type ChapterPdp,
} from "@/lib/climb-chapters";
import type { RoadmapDTO, RoadmapStatus } from "@/lib/roadmap-types";

const topic = (id: string, total: number, resolved: number, status: RoadmapStatus) => ({
  id,
  title: id,
  skills: { jun: [], mid: Array.from({ length: total }, (_, i) => `${id}-${i}`), sen: [] },
  status: { jun: "not-started", mid: status, sen: "not-started" } as Record<"jun" | "mid" | "sen", RoadmapStatus>,
  scores: { jun: null, mid: null, sen: null },
  resolvedSkills: { jun: [], mid: Array.from({ length: resolved }, (_, i) => `${id}-${i}`), sen: [] },
});

const roadmap = (topics: ReturnType<typeof topic>[]): RoadmapDTO => ({
  sections: [{ id: "s", title: "Section", topics }],
  currentGrade: "mid",
  nextGrade: "sen",
});

describe("readinessFor", () => {
  it("averages topic coverage in the target's band, weakest first in focus", () => {
    const r = readinessFor(
      roadmap([topic("a", 4, 4, "mastered"), topic("b", 4, 2, "in-progress"), topic("c", 4, 0, "assessed"), topic("d", 2, 0, "not-started")]),
      "mid+"
    );
    // 1 + 0.5 + 0.6 + 0 over 4 topics
    expect(r.percent).toBe(53);
    expect(r.band).toBe("mid");
    expect(r.mastered).toBe(1);
    expect(r.topics).toBe(4);
    expect(r.focus.map((t) => t.id)).toEqual(["d", "b", "c"]);
  });

  it("ignores topics with no skills in the band and handles an empty roadmap", () => {
    expect(readinessFor(roadmap([topic("a", 0, 0, "not-started")]), "mid").percent).toBe(0);
    expect(readinessFor(roadmap([]), "mid").topics).toBe(0);
  });
});

describe("legPosition", () => {
  it("climbs with readiness to the high camp and never past it", () => {
    expect(legPosition(0)).toBe(0);
    expect(legPosition(35)).toBeCloseTo(HIGH_CAMP / 2);
    expect(legPosition(70)).toBe(HIGH_CAMP);
    expect(legPosition(100)).toBe(HIGH_CAMP);
    expect(legPosition(-5)).toBe(0);
  });
});

describe("summitPush", () => {
  const base = { grade: "mid", readiness: 80, hasCertificate: true, upcomingAssessment: null, pendingRequest: false };

  it("goes from climbing to ready at the threshold, asking for a certificate first", () => {
    expect(summitPush({ ...base, readiness: 69 }).kind).toBe("climbing");
    expect(summitPush(base).kind).toBe("ready");
    expect(summitPush({ ...base, hasCertificate: false }).kind).toBe("needs-cert");
  });

  it("prefers a scheduled assessment, then a pending request, and knows the summit", () => {
    const upcoming = { id: "a1", scheduledAt: null };
    expect(summitPush({ ...base, upcomingAssessment: upcoming, pendingRequest: true })).toEqual({
      kind: "scheduled",
      assessmentId: "a1",
      scheduledAt: null,
    });
    expect(summitPush({ ...base, pendingRequest: true }).kind).toBe("requested");
    expect(summitPush({ ...base, grade: "sen+" }).kind).toBe("summit");
  });
});

describe("buildChapterLog", () => {
  const d = (s: string) => new Date(s);
  const assessment = (id: string, when: string, upgrade?: [string, string]): ChapterAssessment => ({
    id,
    title: id,
    completedAt: d(when),
    reviewedAt: null,
    gradeUpgraded: Boolean(upgrade),
    previousGrade: upgrade?.[0] ?? null,
    newGrade: upgrade?.[1] ?? null,
  });
  const pdp = (id: string, startedAt: string): ChapterPdp => ({
    id,
    fileName: id,
    status: "COMPLETED",
    startedAt: d(startedAt),
    completedAt: null,
  });

  it("closes a chapter at each upgrade and files plans and attempts by date", () => {
    const log = buildChapterLog(
      [
        assessment("up2", "2026-06-01", ["jun+", "mid-"]),
        assessment("fail", "2025-10-01"),
        assessment("up1", "2025-03-01", ["jun", "jun+"]),
      ],
      [pdp("p1", "2025-01-10"), pdp("p2", "2025-05-01"), pdp("p3", "2026-07-01")]
    );
    expect(log.past.map((c) => [c.number, c.fromGrade, c.toGrade, c.attempts])).toEqual([
      [1, "jun", "jun+", 0],
      [2, "jun+", "mid-", 1],
    ]);
    expect(log.past[0].startedAt).toBeNull();
    expect(log.past[1].startedAt).toEqual(d("2025-03-01"));
    expect(log.past.map((c) => c.pdps.map((p) => p.id))).toEqual([["p1"], ["p2"]]);
    expect(log.current).toMatchObject({ number: 3, startedAt: d("2026-06-01"), attempts: 0 });
    expect(log.current.pdps.map((p) => p.id)).toEqual(["p3"]);
  });

  it("keeps a still active plan in the current chapter even if it started before the upgrade", () => {
    const active = { ...pdp("old-active", "2025-01-10"), status: "ACTIVE" };
    const log = buildChapterLog([assessment("up", "2025-03-01", ["jun", "jun+"])], [active, pdp("closed", "2025-01-05")]);
    expect(log.past[0].pdps.map((p) => p.id)).toEqual(["closed"]);
    expect(log.current.pdps.map((p) => p.id)).toEqual(["old-active"]);
  });

  it("without upgrades everything is the first chapter", () => {
    const log = buildChapterLog([assessment("x", "2026-01-01")], [pdp("p", "2026-02-01")]);
    expect(log.past).toEqual([]);
    expect(log.current).toMatchObject({ number: 1, startedAt: null, attempts: 1 });
  });
});

describe("monthsBetween", () => {
  it("counts calendar months, at least one", () => {
    expect(monthsBetween(new Date("2025-03-01"), new Date("2025-10-15"))).toBe(7);
    expect(monthsBetween(new Date("2025-03-01"), new Date("2025-03-20"))).toBe(1);
  });
});
