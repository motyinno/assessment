import { describe, expect, it } from "vitest";
import { computeRoleGrants, entitledRole } from "@/lib/hrm/roles";
import type { MappedEmployee } from "@/lib/hrm/mapping";
import type { Role } from "@/lib/roles";

function employee(id: number, overrides: Partial<MappedEmployee> = {}): MappedEmployee {
  return {
    hrmEmployeeId: id,
    email: `e${id}@x.com`,
    name: `E ${id}`,
    jobTitle: null,
    grade: null,
    professionalLevel: null,
    managerialLevel: null,
    isMentor: false,
    isDeliveryCoordinator: false,
    managerChain: [],
    hrmManagerId: null,
    isArchived: false,
    hrmDismissed: false,
    orgUnitIds: [],
    photoFileName: null,
    ...overrides,
  };
}

function roles(entries: [number, Role][]): Map<number, Role> {
  return new Map(entries);
}

describe("computeRoleGrants", () => {
  it("M1/M2 -> MANAGER, M3/M4/M5 -> ADMIN", () => {
    const employees = [
      employee(1, { managerialLevel: "M1" }),
      employee(2, { managerialLevel: "M2" }),
      employee(3, { managerialLevel: "M3" }),
      employee(4, { managerialLevel: "M4" }),
      employee(5, { managerialLevel: "M5" }),
    ];
    expect(computeRoleGrants(employees, roles([]))).toEqual([
      { hrmEmployeeId: 1, from: "USER", to: "MANAGER", hrmField: "managerialLevel:M1" },
      { hrmEmployeeId: 2, from: "USER", to: "MANAGER", hrmField: "managerialLevel:M2" },
      { hrmEmployeeId: 3, from: "USER", to: "ADMIN", hrmField: "managerialLevel:M3" },
      { hrmEmployeeId: 4, from: "USER", to: "ADMIN", hrmField: "managerialLevel:M4" },
      { hrmEmployeeId: 5, from: "USER", to: "ADMIN", hrmField: "managerialLevel:M5" },
    ]);
  });

  it("no managerial level -> no role, however many people report to them", () => {
    // HRM's `employee.manager` is a lead/mentor assignment, not a rung on the
    // M-ladder. 302 people were MANAGER on a live sync purely because someone
    // pointed at them.
    const employees = [employee(1), employee(2, { hrmManagerId: 1 }), employee(3, { hrmManagerId: 1 })];
    expect(computeRoleGrants(employees, roles([]))).toEqual([]);
  });

  it("heading an org unit grants nothing on its own", () => {
    // All 504 live units carry a headId and 500 of them repeat it as deputyId,
    // so the field selects nothing — it made 266 non-managers ADMIN.
    expect(computeRoleGrants([employee(1)], roles([]))).toEqual([]);
  });

  it("an unknown managerial level grants nothing rather than guessing", () => {
    expect(computeRoleGrants([employee(1, { managerialLevel: "M9" })], roles([]))).toEqual([]);
  });

  it("MANAGER -> ADMIN when the level rises to M3", () => {
    const grants = computeRoleGrants([employee(1, { managerialLevel: "M3" })], roles([[1, "MANAGER"]]));
    expect(grants).toEqual([
      { hrmEmployeeId: 1, from: "MANAGER", to: "ADMIN", hrmField: "managerialLevel:M3" },
    ]);
  });

  it("never lowers: an existing ADMIN who is now only M1 stays ADMIN", () => {
    expect(computeRoleGrants([employee(1, { managerialLevel: "M1" })], roles([[1, "ADMIN"]]))).toEqual([]);
  });

  it("ASSESSOR is not touched when no condition matches", () => {
    expect(computeRoleGrants([employee(1)], roles([[1, "ASSESSOR"]]))).toEqual([]);
  });

  it("ASSESSOR -> MANAGER is a grant (upgrade), with from: ASSESSOR", () => {
    const grants = computeRoleGrants([employee(1, { managerialLevel: "M2" })], roles([[1, "ASSESSOR"]]));
    expect(grants).toEqual([
      { hrmEmployeeId: 1, from: "ASSESSOR", to: "MANAGER", hrmField: "managerialLevel:M2" },
    ]);
  });

  it("re-running with the already-applied roles reflected produces no grants", () => {
    expect(computeRoleGrants([employee(1, { managerialLevel: "M2" })], roles([[1, "MANAGER"]]))).toEqual([]);
  });
});

describe("entitledRole — the same rule, without the 'never lowers' guard", () => {
  it("maps every known level", () => {
    expect(entitledRole("M1")).toEqual({ role: "MANAGER", hrmField: "managerialLevel:M1" });
    expect(entitledRole("M2")?.role).toBe("MANAGER");
    expect(entitledRole("M3")?.role).toBe("ADMIN");
    expect(entitledRole("M4")?.role).toBe("ADMIN");
    expect(entitledRole("M5")?.role).toBe("ADMIN");
  });

  it("no level -> null (i.e. plain USER)", () => {
    expect(entitledRole(null)).toBeNull();
  });

  it("unknown level -> null", () => {
    expect(entitledRole("M9")).toBeNull();
  });
});
