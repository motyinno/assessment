import { describe, expect, it } from "vitest";
import { dropIndex, isPermutation, moveItem } from "@/lib/section-order";

describe("moveItem", () => {
  const abc = ["a", "b", "c", "d"];

  it("moves an item down", () => {
    expect(moveItem(abc, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveItem(abc, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    moveItem(abc, 0, 3);
    expect(abc).toEqual(["a", "b", "c", "d"]);
  });

  it("returns an unchanged copy for no-op or out-of-range moves", () => {
    expect(moveItem(abc, 1, 1)).toEqual(abc);
    expect(moveItem(abc, -1, 2)).toEqual(abc);
    expect(moveItem(abc, 0, 4)).toEqual(abc);
    expect(moveItem(abc, 1, 1)).not.toBe(abc);
  });
});

describe("dropIndex", () => {
  const items = ["a", "b", "c", "d"];
  const drop = (from: number, target: number, pos: "before" | "after") =>
    moveItem(items, from, dropIndex(from, target, pos));

  it("drops above a later item", () => {
    expect(drop(0, 2, "before")).toEqual(["b", "a", "c", "d"]);
  });

  it("drops below a later item", () => {
    expect(drop(0, 2, "after")).toEqual(["b", "c", "a", "d"]);
  });

  it("drops above an earlier item", () => {
    expect(drop(3, 1, "before")).toEqual(["a", "d", "b", "c"]);
  });

  it("drops below an earlier item", () => {
    expect(drop(3, 1, "after")).toEqual(["a", "b", "d", "c"]);
  });

  it("drops onto the last position", () => {
    expect(drop(0, 3, "after")).toEqual(["b", "c", "d", "a"]);
  });

  it("is a no-op when dropped next to itself", () => {
    expect(drop(1, 1, "before")).toEqual(items);
    expect(drop(1, 1, "after")).toEqual(items);
    expect(drop(1, 0, "after")).toEqual(items);
    expect(drop(1, 2, "before")).toEqual(items);
  });
});

describe("isPermutation", () => {
  it("accepts the same ids in another order", () => {
    expect(isPermutation(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
  });

  it("accepts two empty lists", () => {
    expect(isPermutation([], [])).toBe(true);
  });

  it("rejects missing, extra, foreign or duplicate ids", () => {
    expect(isPermutation(["a", "b", "c"], ["a", "b"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "x"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "a"])).toBe(false);
  });
});
