import { describe, expect, it } from "vitest";
import { pdpTopicTicks, type RoadmapDTO, type RoadmapStatus } from "@/lib/roadmap-types";

const topic = (id: string, mid: string[], resolvedMid: string[]) => ({
  id,
  title: id,
  skills: { jun: ["j"], mid, sen: [] },
  status: { jun: "not-started", mid: "not-started", sen: "not-started" } as Record<"jun" | "mid" | "sen", RoadmapStatus>,
  scores: { jun: null, mid: null, sen: null },
  resolvedSkills: { jun: [], mid: resolvedMid, sen: [] },
});

const roadmap: RoadmapDTO = {
  sections: [{ id: "be", title: "Backend", topics: [topic("a", ["a1", "a2", "a3"], ["a2"]), topic("b", ["b1"], ["b1"]), topic("c", ["c1"], [])] }],
  currentGrade: "jun",
  nextGrade: "mid",
};

describe("pdpTopicTicks", () => {
  it("ticks every skill of the plan's topics at the band, keeping what's already ticked", () => {
    expect(pdpTopicTicks(roadmap, "mid", ["a", "b", "zz"])).toEqual([
      { sectionId: "be", topicId: "a", grade: "mid", resolvedSkills: ["a2", "a1", "a3"], added: ["a1", "a3"] },
    ]);
  });
  it("leaves topics outside the plan alone", () => {
    expect(pdpTopicTicks(roadmap, "mid", []).length).toBe(0);
  });
});
