import { describe, expect, it } from "vitest";
import { activeNav, visibleSections } from "@/lib/nav-sections";

const ids = (role: string, isSuperAdmin = false) => visibleSections({ role, isSuperAdmin }).map((s) => s.id);
const tabs = (role: string, id: string, isSuperAdmin = false) =>
  visibleSections({ role, isSuperAdmin })
    .find((s) => s.id === id)
    ?.tabs.map((t) => t.label);

describe("visibleSections", () => {
  it("keeps the sidebar short for every role", () => {
    expect(ids("USER")).toEqual(["dashboard", "climb", "assessments", "matrix", "people"]);
    expect(ids("ADMIN")).toEqual(["dashboard", "climb", "assessments", "matrix", "people", "pdps", "statistics", "settings"]);
  });

  it("shows each role only its tabs", () => {
    expect(tabs("USER", "assessments")).toEqual(["My assessments", "Request"]);
    expect(tabs("ASSESSOR", "assessments")).toEqual(["All", "Request", "Log"]);
    expect(tabs("ADMIN", "assessments")).toEqual(["All", "Requests", "Review", "Log"]);
    expect(tabs("USER", "people")).toEqual(["Org chart"]);
    expect(tabs("MANAGER", "people")).toEqual(["My team", "Users", "Org chart"]);
    expect(tabs("ADMIN", "settings")).toEqual(["Tech matrix", "Session templates", "Interview questions"]);
    expect(tabs("ADMIN", "settings", true)).toEqual(["Tech matrix", "Session templates", "Interview questions"]);
    expect(tabs("ADMIN", "super", true)).toEqual(["Activity", "HRM sync"]);
    expect(tabs("ADMIN", "super")).toBeUndefined();
  });

  it("ignores the super-admin flag on a non-admin, like lib/roles does", () => {
    expect(tabs("USER", "super", true)).toBeUndefined();
  });

  it("points the sidebar link at the first visible tab", () => {
    const people = visibleSections({ role: "USER" }).find((s) => s.id === "people");
    expect(people?.href).toBe("/departments");
  });
});

describe("activeNav", () => {
  const admin = visibleSections({ role: "ADMIN" });

  it("matches sub-pages but prefers the longest tab", () => {
    expect(activeNav(admin, "/assessments/abc")?.section.id).toBe("assessments");
    expect(activeNav(admin, "/tech-matrix")?.section.id).toBe("matrix");
    expect(activeNav(admin, "/tech-matrix/edit")?.section.id).toBe("settings");
    expect(activeNav(admin, "/users/u1/roadmap")?.tab.href).toBe("/users");
  });

  it("doesn't confuse a prefix of another word", () => {
    expect(activeNav(admin, "/assessments-old")).toBeNull();
    expect(activeNav(admin, "/profile")).toBeNull();
  });
});
