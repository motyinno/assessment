import { describe, expect, it } from "vitest";
import { planProgress, progressPercent } from "@/lib/pdp-progress";

const goal = (done: boolean[]) => ({ items: done.map((d) => ({ doneAt: d ? new Date() : null })) });

describe("planProgress", () => {
  it("counts done items across every topic", () => {
    expect(planProgress([goal([true, false]), goal([true, true, false])])).toEqual({ done: 3, total: 5 });
    expect(planProgress([])).toEqual({ done: 0, total: 0 });
  });
});

describe("progressPercent", () => {
  it("rounds and handles an empty plan", () => {
    expect(progressPercent({ done: 1, total: 3 })).toBe(33);
    expect(progressPercent({ done: 0, total: 0 })).toBe(0);
    expect(progressPercent({ done: 5, total: 5 })).toBe(100);
  });
});
