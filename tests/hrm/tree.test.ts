import { describe, expect, it } from "vitest";
import { rebuildDepartmentPaths, type DepartmentNode } from "@/lib/hrm/tree";

describe("rebuildDepartmentPaths", () => {
  it("a flat list with no hierarchy: every node is its own root", () => {
    const nodes: DepartmentNode[] = [
      { id: "a", parentId: null },
      { id: "b", parentId: null },
    ];
    const result = rebuildDepartmentPaths(nodes);
    expect(result.get("a")).toEqual({ path: "a", depth: 0 });
    expect(result.get("b")).toEqual({ path: "b", depth: 0 });
  });

  it("a three-level tree", () => {
    const nodes: DepartmentNode[] = [
      { id: "root", parentId: null },
      { id: "div", parentId: "root" },
      { id: "team", parentId: "div" },
    ];
    const result = rebuildDepartmentPaths(nodes);
    expect(result.get("root")).toEqual({ path: "root", depth: 0 });
    expect(result.get("div")).toEqual({ path: "root/div", depth: 1 });
    expect(result.get("team")).toEqual({ path: "root/div/team", depth: 2 });
  });

  it("multiple roots", () => {
    const nodes: DepartmentNode[] = [
      { id: "root1", parentId: null },
      { id: "child1", parentId: "root1" },
      { id: "root2", parentId: null },
      { id: "child2", parentId: "root2" },
    ];
    const result = rebuildDepartmentPaths(nodes);
    expect(result.get("root1")?.depth).toBe(0);
    expect(result.get("root2")?.depth).toBe(0);
    expect(result.get("child1")).toEqual({ path: "root1/child1", depth: 1 });
    expect(result.get("child2")).toEqual({ path: "root2/child2", depth: 1 });
  });

  it("a cycle in parentId terminates instead of hanging, every node still gets a result", () => {
    const nodes: DepartmentNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "c" },
      { id: "c", parentId: "a" },
    ];
    expect(() => rebuildDepartmentPaths(nodes)).not.toThrow();
    const result = rebuildDepartmentPaths(nodes);
    expect(result.size).toBe(3);
    for (const id of ["a", "b", "c"]) {
      expect(result.get(id)).toBeDefined();
    }
  });

  it("a parentId pointing outside the input set is treated as a root", () => {
    const nodes: DepartmentNode[] = [{ id: "orphan", parentId: "missing" }];
    const result = rebuildDepartmentPaths(nodes);
    expect(result.get("orphan")).toEqual({ path: "orphan", depth: 0 });
  });
});
