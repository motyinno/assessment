import { describe, expect, it } from "vitest";
import {
  checkDictionaries,
  checkEmployees,
  checkMassAdminGrant,
  checkMassDismissal,
  checkOrgUnits,
} from "@/lib/hrm/guards";
import type { HrmDictionaries } from "@/lib/hrm/dictionaries";
import type { MappedEmployee } from "@/lib/hrm/mapping";
import type { HrmOrgUnit } from "@/lib/hrm/types";

function dicts(overrides: Partial<Record<"professionalLevel" | "jobTitle" | "employeeStatus", number>> = {}): HrmDictionaries {
  const make = (size: number) => new Map(Array.from({ length: size }, (_, i) => [String(i), `v${i}`]));
  return {
    professionalLevel: make(overrides.professionalLevel ?? 1),
    jobTitle: make(overrides.jobTitle ?? 1),
    employeeStatus: make(overrides.employeeStatus ?? 1),
    professionalLevelCode: new Map(),
  };
}

function employee(id: number): MappedEmployee {
  return {
    hrmEmployeeId: id,
    email: `e${id}@x.com`,
    name: `E ${id}`,
    jobTitle: null,
    grade: null,
    hrmManagerId: null,
    isArchived: false,
    hrmDismissed: false,
    orgUnitIds: [],
    photoFileName: null,
  };
}

function orgUnit(id: number): HrmOrgUnit {
  return { id, orgUnitName: `Unit ${id}` };
}

describe("checkDictionaries", () => {
  it("ok when all three are non-empty", () => {
    expect(checkDictionaries(dicts())).toEqual({ ok: true });
  });

  it("fails when any dictionary is empty", () => {
    const result = checkDictionaries(dicts({ jobTitle: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("DICTIONARIES_REQUIRED");
      expect(result.message).toContain("jobTitle");
    }
  });
});

describe("checkOrgUnits", () => {
  it("fails on an empty list", () => {
    const result = checkOrgUnits([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("EMPTY_ORG_UNITS");
  });

  it("ok on a non-empty list", () => {
    expect(checkOrgUnits([orgUnit(1)])).toEqual({ ok: true });
  });
});

describe("checkEmployees", () => {
  it("fails on an empty list", () => {
    const result = checkEmployees([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("EMPTY_EMPLOYEES");
  });

  it("ok on a non-empty list", () => {
    expect(checkEmployees([employee(1)])).toEqual({ ok: true });
  });
});

describe("checkMassDismissal", () => {
  it("ok exactly at the threshold", () => {
    const result = checkMassDismissal({ toArchiveCount: 20, currentActiveCount: 100, maxRatio: 0.2 });
    expect(result).toEqual({ ok: true });
  });

  it("fails just above the threshold", () => {
    const result = checkMassDismissal({ toArchiveCount: 21, currentActiveCount: 100, maxRatio: 0.2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("MASS_DISMISSAL");
      expect(result.message).toContain("21");
      expect(result.message).toContain("100");
      expect(result.message).toContain("20%");
    }
  });

  it("ok when there's nothing to protect (currentActiveCount = 0)", () => {
    expect(checkMassDismissal({ toArchiveCount: 5, currentActiveCount: 0, maxRatio: 0.2 })).toEqual({ ok: true });
  });
});

describe("checkMassAdminGrant", () => {
  it("ok exactly at the threshold", () => {
    expect(checkMassAdminGrant({ newAdminCount: 3, maxGrants: 3 })).toEqual({ ok: true });
  });

  it("fails just above the threshold", () => {
    const result = checkMassAdminGrant({ newAdminCount: 4, maxGrants: 3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("MASS_ADMIN_GRANT");
      expect(result.message).toContain("4");
      expect(result.message).toContain("3");
    }
  });
});
