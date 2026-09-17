import { describe, expect, it } from "vitest";
import {
  buildOrgStructure,
  pickDivision,
  resolveDivisionId,
  type DepartmentWithPath,
  type OrgUnitRef,
} from "@/lib/org-structure";

const unit = (id: string, name: string, typeName: string | null): OrgUnitRef => ({ id, name, typeName });

// The real shape from a live employee: one Unit, one Division, one Department,
// in no particular order — see tests/fixtures/hrm/employees-actual.json.
const MEMBERSHIPS: OrgUnitRef[] = [
  unit("d1", "DevOps", "Division"),
  unit("d2", "Python 3", "Department"),
  unit("d3", "Global Development", "Unit"),
];

describe("buildOrgStructure", () => {
  it("places each membership into its own level, root-first", () => {
    const slots = buildOrgStructure(MEMBERSHIPS);
    expect(slots.map((s) => s.type)).toEqual([
      "Unit",
      "Division",
      "Department",
      "Team",
      "Group",
      "Person",
    ]);
    expect(slots[0].units.map((u) => u.name)).toEqual(["Global Development"]);
    expect(slots[1].units.map((u) => u.name)).toEqual(["DevOps"]);
    expect(slots[2].units.map((u) => u.name)).toEqual(["Python 3"]);
  });

  it("keeps empty levels as empty slots rather than dropping them", () => {
    const slots = buildOrgStructure(MEMBERSHIPS);
    expect(slots.filter((s) => s.units.length === 0).map((s) => s.type)).toEqual([
      "Team",
      "Group",
      "Person",
    ]);
  });

  it("drops units of a type we don't model", () => {
    const slots = buildOrgStructure([...MEMBERSHIPS, unit("d9", "test test test", "test")]);
    expect(slots.flatMap((s) => s.units).map((u) => u.id)).not.toContain("d9");
  });

  it("keeps both units when someone sits in two of the same level", () => {
    const slots = buildOrgStructure([unit("t2", "Beta", "Team"), unit("t1", "Alpha", "Team")]);
    // Sorted by name, so the order doesn't depend on HRM's array order.
    expect(slots.find((s) => s.type === "Team")?.units.map((u) => u.name)).toEqual(["Alpha", "Beta"]);
  });
});

describe("pickDivision", () => {
  it("returns the Division-typed membership", () => {
    expect(pickDivision(MEMBERSHIPS)?.name).toBe("DevOps");
  });

  it("returns null when there is none", () => {
    expect(pickDivision([unit("d2", "Python 3", "Department")])).toBeNull();
  });
});

describe("resolveDivisionId", () => {
  const withPath = (u: OrgUnitRef, path: string): DepartmentWithPath => ({ ...u, path });

  it("prefers a direct Division membership", () => {
    const memberships = [
      withPath(unit("d1", "DevOps", "Division"), "root/d1"),
      withPath(unit("d2", "Python 3", "Department"), "root/other/d2"),
    ];
    expect(resolveDivisionId(memberships, new Map())).toBe("d1");
  });

  it("falls back to the nearest Division ancestor of a membership", () => {
    const memberships = [withPath(unit("d2", "Python 3", "Department"), "root/div/d2")];
    const byId = new Map([
      ["root", unit("root", "Innowise", "Person")],
      ["div", unit("div", "NodeJS", "Division")],
      ["d2", unit("d2", "Python 3", "Department")],
    ]);
    expect(resolveDivisionId(memberships, byId)).toBe("div");
  });

  it("takes the NEAREST Division when the chain has two", () => {
    const memberships = [withPath(unit("d2", "Python 3", "Department"), "root/outer/inner/d2")];
    const byId = new Map([
      ["outer", unit("outer", "Outer", "Division")],
      ["inner", unit("inner", "Inner", "Division")],
      ["d2", unit("d2", "Python 3", "Department")],
    ]);
    expect(resolveDivisionId(memberships, byId)).toBe("inner");
  });

  it("is stable under membership order — deepest membership wins ties", () => {
    const shallow = withPath(unit("a", "A", "Team"), "root/divA/a");
    const deep = withPath(unit("b", "B", "Team"), "root/divA/mid/divB/b");
    const byId = new Map([
      ["divA", unit("divA", "A division", "Division")],
      ["divB", unit("divB", "B division", "Division")],
    ]);
    expect(resolveDivisionId([shallow, deep], byId)).toBe("divB");
    expect(resolveDivisionId([deep, shallow], byId)).toBe("divB");
  });

  it("returns null with no memberships and with no Division anywhere", () => {
    expect(resolveDivisionId([], new Map())).toBeNull();
    const orphan = [withPath(unit("d2", "Python 3", "Department"), "root/d2")];
    expect(resolveDivisionId(orphan, new Map([["root", unit("root", "R", "Unit")]]))).toBeNull();
  });
});
