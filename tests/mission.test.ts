import { describe, expect, it } from "vitest";
import {
  missionStreak,
  offeredAgainFrom,
  parseMissionPlan,
  rankMissionTopics,
  recentTopics,
  weekStartOf,
  type CoachSignals,
} from "@/lib/mission";
import type { RoadmapDTO, RoadmapStatus } from "@/lib/roadmap-types";

const topic = (id: string, total: number, resolved: number, status: RoadmapStatus = resolved ? "in-progress" : "not-started") => ({
  id,
  title: id.toUpperCase(),
  skills: { jun: [], mid: Array.from({ length: total }, (_, i) => `${id}-${i}`), sen: [] },
  status: { jun: "not-started", mid: status, sen: "not-started" } as Record<"jun" | "mid" | "sen", RoadmapStatus>,
  scores: { jun: null, mid: null, sen: null },
  resolvedSkills: { jun: [], mid: Array.from({ length: resolved }, (_, i) => `${id}-${i}`), sen: [] },
});

const roadmap = (topics: ReturnType<typeof topic>[]): RoadmapDTO => ({
  sections: [{ id: "s", title: "Backend", topics }],
  currentGrade: "jun",
  nextGrade: "mid",
});

const signals = (over: Partial<CoachSignals> = {}): CoachSignals => ({
  struggle: {},
  pdpTopicIds: new Set(),
  asked: { topics: {}, skills: {} },
  recentTopicIds: new Set(),
  ...over,
});

describe("weekStartOf", () => {
  it("returns the Monday of the week in UTC", () => {
    expect(weekStartOf(new Date("2026-11-13T10:00:00Z"))).toBe("2026-11-09"); // Friday
    expect(weekStartOf(new Date("2026-11-09T00:00:00Z"))).toBe("2026-11-09"); // Monday
    expect(weekStartOf(new Date("2026-11-15T23:59:00Z"))).toBe("2026-11-09"); // Sunday
  });
});

describe("rankMissionTopics", () => {
  it("skips mastered and fully ticked topics, and puts the biggest gap first", () => {
    const rm = roadmap([topic("a", 4, 3), topic("b", 4, 0), topic("c", 4, 4), topic("d", 4, 0, "mastered")]);
    const ranked = rankMissionTopics(rm, "mid", signals());
    expect(ranked.map((o) => o.topicId)).toEqual(["b", "a"]);
    expect(ranked[0].reasons).toEqual([{ kind: "gap", resolved: 0, total: 4 }]);
    expect(ranked[1].skills).toEqual(["a-3"]);
  });

  it("lifts topics people stumble on at assessments and PDP goals", () => {
    const rm = roadmap([topic("a", 4, 0), topic("b", 4, 1), topic("c", 4, 1)]);
    const ranked = rankMissionTopics(
      rm,
      "mid",
      signals({ struggle: { c: { assessed: 6, weak: 4 }, b: { assessed: 2, weak: 2 } }, pdpTopicIds: new Set(["b"]) })
    );
    expect(ranked.map((o) => o.topicId)).toEqual(["b", "c", "a"]);
    expect(ranked[1].reasons).toContainEqual({ kind: "struggle", weak: 4, assessed: 6 });
    // Two people assessed is too few to call it a pattern.
    expect(ranked[0].reasons.some((r) => r.kind === "struggle")).toBe(false);
    expect(ranked[0].reasons).toContainEqual({ kind: "pdp" });
  });

  it("focuses on the skills clients ask about most, up to three", () => {
    const rm = roadmap([topic("a", 5, 0)]);
    const [o] = rankMissionTopics(rm, "mid", signals({ asked: { topics: { a: { asked: 9 } }, skills: { a: { "a-4": 6, "a-2": 3 } } } }));
    expect(o.skills).toEqual(["a-4", "a-2", "a-0"]);
    expect(o.reasons).toContainEqual({ kind: "asked", times: 9 });
  });

  it("drops recently worked topics unless nothing else is left", () => {
    const rm = roadmap([topic("a", 4, 0), topic("b", 4, 2)]);
    expect(rankMissionTopics(rm, "mid", signals({ recentTopicIds: new Set(["a"]) })).map((o) => o.topicId)).toEqual(["b"]);
    expect(rankMissionTopics(rm, "mid", signals({ recentTopicIds: new Set(["a", "b"]) })).map((o) => o.topicId)).toEqual(["a", "b"]);
  });
});

describe("recentTopics", () => {
  it("keeps active missions and those from the last four weeks", () => {
    const now = new Date("2026-11-13T00:00:00Z");
    const set = recentTopics(
      [
        { topicId: "old", status: "DONE", createdAt: new Date("2026-09-01T00:00:00Z") },
        { topicId: "new", status: "DROPPED", createdAt: new Date("2026-11-01T00:00:00Z") },
        { topicId: "still", status: "ACTIVE", createdAt: new Date("2026-08-01T00:00:00Z") },
      ],
      now
    );
    expect([...set].sort()).toEqual(["new", "still"]);
  });
});

describe("missionStreak", () => {
  const now = new Date("2026-11-13T12:00:00Z"); // week of Nov 9
  it("counts consecutive weeks, not breaking on the still-open current week", () => {
    expect(missionStreak([new Date("2026-11-04T00:00:00Z"), new Date("2026-10-28T00:00:00Z")], now)).toBe(2);
    expect(
      missionStreak([new Date("2026-11-10T00:00:00Z"), new Date("2026-11-04T00:00:00Z"), new Date("2026-11-03T00:00:00Z")], now)
    ).toBe(2);
  });
  it("is zero after a missed week", () => {
    expect(missionStreak([new Date("2026-10-28T00:00:00Z")], now)).toBe(0);
    expect(missionStreak([], now)).toBe(0);
  });
});

describe("parseMissionPlan", () => {
  it("validates the plan and keeps only https resources", () => {
    const plan = parseMissionPlan({
      summary: "Why",
      steps: [{ kind: "read", title: "T", detail: "D", minutes: "45" }],
      task: { title: "Task", description: "Do it" },
      resources: [
        { label: "Docs", url: "https://nodejs.org/api/" },
        { label: "Bad", url: "javascript:alert(1)" },
        { label: "Plain", url: "http://example.com" },
      ],
    });
    expect(plan.steps[0]).toEqual({ kind: "learn", title: "T", detail: "D", minutes: 45 });
    expect(plan.task.doneWhen).toEqual([]);
    expect(plan.resources).toEqual([{ label: "Docs", url: "https://nodejs.org/api/" }]);
  });
  it("throws on an unusable plan", () => {
    expect(() => parseMissionPlan({ summary: "x", steps: [] })).toThrow();
  });
});

describe("offeredAgainFrom", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  it("is the end of the cooldown while it lasts, then null", () => {
    expect(offeredAgainFrom(new Date("2026-11-13T10:00:00Z"), now)).toBe("2026-12-11T10:00:00.000Z");
    expect(offeredAgainFrom(new Date("2026-10-01T00:00:00Z"), now)).toBeNull();
  });
});
