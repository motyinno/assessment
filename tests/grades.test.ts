import { describe, expect, it } from "vitest";
import { assessmentTargetGrade, nextGrade } from "@/lib/grades";

describe("nextGrade", () => {
  it("steps up one grade, including across bands", () => {
    expect(nextGrade("mid")).toBe("mid+");
    expect(nextGrade("jun+")).toBe("mid-");
    expect(nextGrade("Trainee")).toBe("Intern");
  });

  it("returns null at the top, for unknown and for missing grades", () => {
    expect(nextGrade("sen+")).toBeNull();
    expect(nextGrade("wizard")).toBeNull();
    expect(nextGrade(null)).toBeNull();
  });
});

describe("assessmentTargetGrade", () => {
  it("targets the grade one step above the stored one", () => {
    expect(assessmentTargetGrade({ id: "a1", grade: "mid" })).toEqual({
      target: "Middle+",
      current: "Middle",
    });
  });

  it("falls back to the grade itself when there is nothing above", () => {
    expect(assessmentTargetGrade({ id: "a1", grade: "sen+" }).target).toBe("Senior+");
    expect(assessmentTargetGrade({ id: "a1", grade: null }).target).toBe("—");
  });

  it("uses a legacy assessment's stored grade as the target, with no current grade", () => {
    expect(assessmentTargetGrade({ id: "legacy_a_1", grade: "mid-" })).toEqual({
      target: "Middle-",
      current: null,
    });
  });
});
