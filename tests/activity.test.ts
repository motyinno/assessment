import { describe, expect, it } from "vitest";
import { buildUserRows, byDivision, fillDays, normalizePath } from "@/lib/activity";

describe("normalizePath", () => {
  it("drops query and collapses record ids", () => {
    expect(normalizePath("/users/cmw91ikh20000rtu1slmif4mf/roadmap?tab=x")).toBe("/users/:id/roadmap");
    expect(normalizePath("/assessments/123")).toBe("/assessments/:id");
    expect(normalizePath("/pdps/0b7a9d4e-1c2f-4a3b-9d8e-7f6a5b4c3d2e")).toBe("/pdps/:id");
    expect(normalizePath("/tech-matrix/edit")).toBe("/tech-matrix/edit");
    expect(normalizePath("/")).toBe("/");
  });

  it("rejects anything that isn't an app path", () => {
    expect(normalizePath("https://evil.example")).toBeNull();
    expect(normalizePath("//evil.example")).toBeNull();
    expect(normalizePath(42)).toBeNull();
  });
});

describe("fillDays", () => {
  it("returns every day of the window, oldest first, with gaps as zeros", () => {
    const days = fillDays([{ day: "2026-11-09", users: 3, views: 10 }], new Date("2026-11-10T12:00:00Z"), 3);
    expect(days).toEqual([
      { day: "2026-11-08", users: 0, views: 0 },
      { day: "2026-11-09", users: 3, views: 10 },
      { day: "2026-11-10", users: 0, views: 0 },
    ]);
  });
});

describe("buildUserRows", () => {
  it("merges counts, sorts the most recently seen first and never-seen last", () => {
    const users = [
      { id: "a", name: "Ann", email: "a@x", role: "USER" },
      { id: "b", name: "Bob", email: "b@x", role: "USER" },
      { id: "c", name: "Cid", email: "c@x", role: "ADMIN" },
    ];
    const rows = buildUserRows(
      users,
      [
        { userId: "b", kind: "sign_in", count: 2 },
        { userId: "b", kind: "view", count: 9 },
        { userId: "c", kind: "view", count: 1 },
      ],
      [
        { userId: "b", at: new Date("2026-11-09T10:00:00Z") },
        { userId: "c", at: new Date("2026-11-10T10:00:00Z") },
      ]
    );
    expect(rows.map((r) => [r.id, r.signIns, r.views])).toEqual([
      ["c", 0, 1],
      ["b", 2, 9],
      ["a", 0, 0],
    ]);
    expect(rows[2].lastSeen).toBeNull();
  });
});

describe("byDivision", () => {
  it("sums each division, counts active people, and puts people without one last", () => {
    const rows = buildUserRows(
      [
        { id: "a", name: "Ann", email: "a@x", role: "USER", divisionId: "d1" },
        { id: "b", name: "Bob", email: "b@x", role: "USER", divisionId: "d1" },
        { id: "c", name: "Cid", email: "c@x", role: "USER", divisionId: null },
        { id: "e", name: "Eve", email: "e@x", role: "USER", divisionId: "d2" },
      ],
      [
        { userId: "a", kind: "view", count: 4 },
        { userId: "a", kind: "sign_in", count: 1 },
        { userId: "c", kind: "view", count: 2 },
      ],
      [],
      new Map([["d1", "Node.js"], ["d2", "Python"]])
    );
    expect(byDivision(rows)).toEqual([
      { id: "d1", name: "Node.js", total: 2, active: 1, signIns: 1, views: 4 },
      { id: "d2", name: "Python", total: 1, active: 0, signIns: 0, views: 0 },
      { id: null, name: "No division", total: 1, active: 1, signIns: 0, views: 2 },
    ]);
  });
});
