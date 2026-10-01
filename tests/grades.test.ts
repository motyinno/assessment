import { describe, expect, it } from "vitest";
import { nextGrade, targetGradeLabel } from "@/lib/grades";

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

describe("targetGradeLabel", () => {
  it("labels the grade one step above", () => {
    expect(targetGradeLabel("mid")).toBe("Middle+");
  });

  it("falls back to the grade itself when there is nothing above", () => {
    expect(targetGradeLabel("sen+")).toBe("Senior+");
    expect(targetGradeLabel(null)).toBe("—");
  });
});
