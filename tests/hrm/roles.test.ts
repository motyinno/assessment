import { describe, expect, it } from "vitest";
import { computeRoleGrants } from "@/lib/hrm/roles";
import type { MappedEmployee } from "@/lib/hrm/mapping";
import type { HrmOrgUnit } from "@/lib/hrm/types";
import type { Role } from "@/lib/roles";

function employee(id: number, overrides: Partial<MappedEmployee> = {}): MappedEmployee {
  return {
    hrmEmployeeId: id,
    email: `e${id}@x.com`,
    name: `E ${id}`,
    jobTitle: null,
    grade: null,
    hrmManagerId: null,
    hrmM3ManagerId: null,
    hrmM4ManagerId: null,
    isArchived: false,
    hrmDismissed: false,
    orgUnitIds: [],
    photoFileName: null,
    ...overrides,
  };
}

function orgUnit(id: number, overrides: Partial<HrmOrgUnit> = {}): HrmOrgUnit {
  return { id, orgUnitName: `Unit ${id}`, ...overrides };
}

function activeUnit(id: number, headId: number): HrmOrgUnit {
  return orgUnit(id, { headId, orgUnitTypeDto: { lifecycleStatus: "ACTUAL" } });
}

function inactiveUnit(id: number, headId: number): HrmOrgUnit {
  return orgUnit(id, { headId, orgUnitTypeDto: { lifecycleStatus: "DELETED" } });
}

function roles(entries: [number, Role][]): Map<number, Role> {
  return new Map(entries);
}

describe("computeRoleGrants", () => {
  it("USER -> MANAGER via employeeManagerId", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "USER", to: "MANAGER", hrmField: "employeeManagerId" }]);
  });

  it("USER -> MANAGER via headId of an active org unit", () => {
    const employees = [employee(1)];
    const grants = computeRoleGrants(employees, [activeUnit(100, 1)], roles([]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "USER", to: "MANAGER", hrmField: "headId" }]);
  });

  it("headId of an INACTIVE org unit does not grant MANAGER", () => {
    const employees = [employee(1)];
    const grants = computeRoleGrants(employees, [inactiveUnit(100, 1)], roles([]));
    expect(grants).toEqual([]);
  });

  it("USER -> ADMIN via managerM3", () => {
    const employees = [employee(1), employee(2, { hrmM3ManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "USER", to: "ADMIN", hrmField: "managerM3" }]);
  });

  it("USER -> ADMIN via managerM4", () => {
    const employees = [employee(1), employee(2, { hrmM4ManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "USER", to: "ADMIN", hrmField: "managerM4" }]);
  });

  it("MANAGER -> ADMIN when the M3/M4 condition appears later", () => {
    const employees = [employee(1), employee(2, { hrmM3ManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([[1, "MANAGER"]]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "MANAGER", to: "ADMIN", hrmField: "managerM3" }]);
  });

  it("ADMIN -> MANAGER does not happen: an existing ADMIN who is now just a line manager stays ADMIN", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([[1, "ADMIN"]]));
    expect(grants).toEqual([]);
  });

  it("ASSESSOR is not touched when it doesn't meet any grant condition", () => {
    const employees = [employee(1)];
    const grants = computeRoleGrants(employees, [], roles([[1, "ASSESSOR"]]));
    expect(grants).toEqual([]);
  });

  it("ASSESSOR -> MANAGER is a grant (upgrade), with from: ASSESSOR", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([[1, "ASSESSOR"]]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "ASSESSOR", to: "MANAGER", hrmField: "employeeManagerId" }]);
  });

  it("re-running with the already-applied roles reflected produces no grants", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([[1, "MANAGER"]]));
    expect(grants).toEqual([]);
  });

  it("one person both employeeManagerId and managerM3 -> ADMIN, hrmField lists both", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1, hrmM3ManagerId: 1 })];
    const grants = computeRoleGrants(employees, [], roles([]));
    expect(grants).toEqual([
      { hrmEmployeeId: 1, from: "USER", to: "ADMIN", hrmField: "managerM3+employeeManagerId" },
    ]);
  });

  it("headId and employeeManagerId both matching MANAGER -> hrmField lists both", () => {
    const employees = [employee(1), employee(2, { hrmManagerId: 1 })];
    const grants = computeRoleGrants(employees, [activeUnit(100, 1)], roles([]));
    expect(grants).toEqual([{ hrmEmployeeId: 1, from: "USER", to: "MANAGER", hrmField: "employeeManagerId+headId" }]);
  });
});
