import { describe, expect, it } from "vitest";
import { proximityRank, rankCandidates } from "@/lib/assessor-suggestion";

describe("proximityRank", () => {
  it("returns 0 when subject and candidate share a unit", () => {
    const subject = [{ id: "u1", parentId: "root" }];
    const candidate = [{ id: "u1", parentId: "root" }];
    expect(proximityRank(subject, candidate)).toBe(0);
  });

  it("returns 1 when units differ but share a parent", () => {
    const subject = [{ id: "u1", parentId: "root" }];
    const candidate = [{ id: "u2", parentId: "root" }];
    expect(proximityRank(subject, candidate)).toBe(1);
  });

  it("returns 2 when nothing is shared", () => {
    const subject = [{ id: "u1", parentId: "root" }];
    const candidate = [{ id: "u2", parentId: "other" }];
    expect(proximityRank(subject, candidate)).toBe(2);
  });

  it("returns 2 (no throw) when the subject has no units", () => {
    const candidate = [{ id: "u2", parentId: "root" }];
    expect(proximityRank([], candidate)).toBe(2);
  });

  it("returns 2 (no throw) when the candidate has no units", () => {
    const subject = [{ id: "u1", parentId: "root" }];
    expect(proximityRank(subject, [])).toBe(2);
  });

  it("does not treat a candidate unit id matching the subject's parentId as a match", () => {
    // subject unit's parentId happens to equal candidate's unit id — must not
    // be conflated with an actual shared-parent (rank 1) relationship.
    const subject = [{ id: "u1", parentId: "root" }];
    const candidate = [{ id: "root", parentId: "top" }];
    expect(proximityRank(subject, candidate)).toBe(2);
  });
});

describe("rankCandidates", () => {
  const subjectUnits = [{ id: "u1", parentId: "root" }];

  function candidate(overrides: Partial<{
    id: string;
    name: string;
    grade: string | null;
    ongoingCount: number;
    units: Array<{ id: string; parentId: string | null }>;
  }>) {
    return {
      id: overrides.id ?? "x",
      name: overrides.name ?? "X",
      email: `${overrides.id ?? "x"}@example.com`,
      grade: overrides.grade ?? "mid",
      ongoingCount: overrides.ongoingCount ?? 0,
      departments: [],
      units: overrides.units ?? [],
    };
  }

  it("orders by proximity first regardless of load", () => {
    const near = candidate({ id: "near", units: [{ id: "u1", parentId: "root" }], ongoingCount: 5 });
    const far = candidate({ id: "far", units: [], ongoingCount: 0 });
    const result = rankCandidates([far, near], { subjectRank: 0, subjectUnits });
    expect(result.map((c) => c.id)).toEqual(["near", "far"]);
    expect(result[0].proximity).toBe(0);
    expect(result[1].proximity).toBe(2);
  });

  it("breaks proximity ties by lower ongoing load", () => {
    const busy = candidate({ id: "busy", units: [{ id: "u1", parentId: "root" }], ongoingCount: 3 });
    const idle = candidate({ id: "idle", units: [{ id: "u1", parentId: "root" }], ongoingCount: 0 });
    const result = rankCandidates([busy, idle], { subjectRank: 0, subjectUnits });
    expect(result.map((c) => c.id)).toEqual(["idle", "busy"]);
  });

  it("breaks proximity+load ties by grade closer to the subject", () => {
    const senior = candidate({ id: "senior", grade: "sen", units: [], ongoingCount: 0 });
    const mid = candidate({ id: "mid", grade: "mid", units: [], ongoingCount: 0 });
    // subjectRank corresponds to "mid" — mid should rank above senior.
    const result = rankCandidates([senior, mid], {
      subjectRank: 6, // gradeRank("mid")
      subjectUnits,
    });
    expect(result.map((c) => c.id)).toEqual(["mid", "senior"]);
  });

  it("is deterministic by name when everything else ties", () => {
    const bob = candidate({ id: "bob", name: "Bob" });
    const alice = candidate({ id: "alice", name: "Alice" });
    const result = rankCandidates([bob, alice], { subjectRank: 0, subjectUnits: [] });
    expect(result.map((c) => c.id)).toEqual(["alice", "bob"]);
  });

  it("is a sort, not a filter — candidates of every proximity rank remain in the output", () => {
    const near = candidate({ id: "near", units: [{ id: "u1", parentId: "root" }] });
    const neighbor = candidate({ id: "neighbor", units: [{ id: "u2", parentId: "root" }] });
    const far = candidate({ id: "far", units: [{ id: "u9", parentId: "elsewhere" }] });
    const result = rankCandidates([far, neighbor, near], { subjectRank: 0, subjectUnits });
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.proximity)).toEqual([0, 1, 2]);
  });
});
