import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  displayName,
  mapEmployee,
  mapManagerChain,
  mapOrgUnit,
  rawManagerId,
  resolveManagerialLevel,
  resolveOrgUnitParents,
} from "@/lib/hrm/mapping";
import { buildDictionaryMaps } from "@/lib/hrm/dictionaries";
import type { HrmDictionaries } from "@/lib/hrm/dictionaries";
import type { HrmDictionaryResponse, HrmEmployee, HrmOrgUnit } from "@/lib/hrm/types";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/hrm");
function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf-8")) as T;
}

const dictRaw = loadFixture<HrmDictionaryResponse>("dictionaries.json");
const { dictionaries } = buildDictionaryMaps(dictRaw);
const actualEmployees = loadFixture<HrmEmployee[]>("employees-actual.json");
const deletedEmployees = loadFixture<HrmEmployee[]>("employees-deleted.json");
const orgUnits = loadFixture<HrmOrgUnit[]>("org-units.json");

describe("displayName", () => {
  it("prefers the English name", () => {
    expect(displayName({ firstNameEn: "Alex", lastNameEn: "Ivanov", firstNameRu: "Алекс", lastNameRu: "Иванов", email: "a@b.com" })).toBe(
      "Alex Ivanov"
    );
  });

  it("falls back to the Russian name when English is absent", () => {
    expect(displayName({ firstNameEn: null, lastNameEn: null, firstNameRu: "Алекс", lastNameRu: "Иванов", email: "a@b.com" })).toBe(
      "Алекс Иванов"
    );
  });

  it("falls back to the local part of the email when both names are empty", () => {
    expect(displayName({ firstNameEn: "", lastNameEn: "", firstNameRu: "", lastNameRu: "", email: "alex.ivanov@example.com" })).toBe(
      "alex.ivanov"
    );
  });

  it("trims and collapses whitespace-only name parts", () => {
    expect(displayName({ firstNameEn: "  ", lastNameEn: "Ivanov", firstNameRu: null, lastNameRu: null, email: "a@b.com" })).toBe(
      "Ivanov"
    );
  });
});

describe("rawManagerId", () => {
  it("reads id when present", () => {
    expect(rawManagerId({ id: 42 })).toBe(42);
  });

  it("returns null when the ref has no id (empty object)", () => {
    expect(rawManagerId({})).toBeNull();
  });

  it("returns null when the ref is entirely absent", () => {
    expect(rawManagerId(undefined)).toBeNull();
    expect(rawManagerId(null)).toBeNull();
  });
});

describe("mapEmployee — synthetic edge cases", () => {
  const dicts: HrmDictionaries = dictionaries;

  it("orgUnits: empty array -> orgUnitIds: []", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com", orgUnits: [] }, dicts);
    expect(employee.orgUnitIds).toEqual([]);
  });

  it("orgUnits: one element -> orgUnitIds with one id", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com", orgUnits: [{ id: 32 }] }, dicts);
    expect(employee.orgUnitIds).toEqual([32]);
  });

  it("orgUnits: three elements -> orgUnitIds with all three ids", () => {
    const { employee } = mapEmployee(
      { id: 1, email: "a@b.com", orgUnits: [{ id: 1 }, { id: 2 }, { id: 3 }] },
      dicts
    );
    expect(employee.orgUnitIds).toEqual([1, 2, 3]);
  });

  it("lifecycleStatus DELETED -> isArchived and hrmDismissed both true", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com", lifecycleStatus: "DELETED" }, dicts);
    expect(employee.isArchived).toBe(true);
    expect(employee.hrmDismissed).toBe(true);
  });

  it("lifecycleStatus ACTUAL -> isArchived and hrmDismissed both false", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com", lifecycleStatus: "ACTUAL" }, dicts);
    expect(employee.isArchived).toBe(false);
    expect(employee.hrmDismissed).toBe(false);
  });

  it("email is normalized: upper case and surrounding whitespace both stripped", () => {
    const { employee } = mapEmployee({ id: 1, email: "  ALEX.IVANOV@Example.COM  " }, dicts);
    expect(employee.email).toBe("alex.ivanov@example.com");
  });

  it("manager without an id (empty object) -> hrmManagerId: null", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com", manager: {} }, dicts);
    expect(employee.hrmManagerId).toBeNull();
  });

  it("managerM3/managerM4 present -> the M-chain carries them at their own levels", () => {
    const { employee } = mapEmployee(
      { id: 1, email: "a@b.com", managerM3: { id: 30 }, managerM4: { id: 40 } },
      dicts
    );
    expect(employee.managerChain).toEqual([
      { level: 3, hrmManagerId: 30 },
      { level: 4, hrmManagerId: 40 },
    ]);
  });

  it("no M-managers at all -> empty chain", () => {
    const { employee } = mapEmployee({ id: 1, email: "a@b.com" }, dicts);
    expect(employee.managerChain).toEqual([]);
  });

  it("M-managers present but without an id (empty objects) -> empty chain", () => {
    const { employee } = mapEmployee(
      { id: 1, email: "a@b.com", managerM3: {}, managerM4: {} },
      dicts
    );
    expect(employee.managerChain).toEqual([]);
  });

  it("throws when id is missing — not this function's job to guess an idempotency key", () => {
    expect(() => mapEmployee({ email: "a@b.com" }, dicts)).toThrow();
  });

  it("throws when email is missing — it's the matching key", () => {
    expect(() => mapEmployee({ id: 1 }, dicts)).toThrow();
  });
});

describe("mapEmployee — against real (anonymized) stage fixtures", () => {
  const dicts: HrmDictionaries = dictionaries;

  it("maps every ACTUAL fixture employee without throwing, with a resolved jobTitle", () => {
    for (const raw of actualEmployees) {
      const { employee } = mapEmployee(raw, dicts);
      expect(employee.hrmEmployeeId).toBe(raw.id);
      expect(employee.isArchived).toBe(false);
      expect(employee.orgUnitIds.length).toBe((raw.orgUnits ?? []).length);
      if (raw.jobTitleId) expect(employee.jobTitle).not.toBeNull();
    }
  });

  it("maps every DELETED fixture employee as archived+dismissed", () => {
    for (const raw of deletedEmployees) {
      const { employee } = mapEmployee(raw, dicts);
      expect(employee.isArchived).toBe(true);
      expect(employee.hrmDismissed).toBe(true);
    }
  });
});

describe("extractPhotoFileName / mapEmployee photoFileName", () => {
  const dicts: HrmDictionaries = dictionaries;

  it("parses the path out of a live linkProfilePicture URL", () => {
    const employee = {
      ...actualEmployees[0],
      linkProfilePicture:
        "https://hrm-stage-employee-photo-bucket.s3.eu-north-1.amazonaws.com/photos/a3a701dc-7d9d-4995-9f7b-f0f2332cdc55.jpeg?X-Amz-Expires=300&X-Amz-Signature=abc",
    };
    const { employee: mapped } = mapEmployee(employee, dicts);
    expect(mapped.photoFileName).toBe("photos/a3a701dc-7d9d-4995-9f7b-f0f2332cdc55.jpeg");
  });

  it("maps an empty linkProfilePicture to null, not a throw", () => {
    const employee = { ...actualEmployees[0], linkProfilePicture: "" };
    const { employee: mapped } = mapEmployee(employee, dicts);
    expect(mapped.photoFileName).toBeNull();
  });

  it("maps a missing linkProfilePicture to null", () => {
    const { linkProfilePicture, ...rest } = actualEmployees[0];
    const { employee: mapped } = mapEmployee(rest, dicts);
    expect(mapped.photoFileName).toBeNull();
  });
});

describe("mapOrgUnit", () => {
  it("orgUnitTypeDto.lifecycleStatus DELETED -> isActive: false", () => {
    const mapped = mapOrgUnit({ id: 1, orgUnitTypeDto: { lifecycleStatus: "DELETED" } });
    expect(mapped.isActive).toBe(false);
  });

  it("orgUnitTypeDto.lifecycleStatus anything else -> isActive: true", () => {
    const mapped = mapOrgUnit({ id: 1, orgUnitTypeDto: { lifecycleStatus: "ACTUAL" } });
    expect(mapped.isActive).toBe(true);
  });

  it("isSinglePerson: true is propagated", () => {
    const mapped = mapOrgUnit({ id: 1, orgUnitTypeDto: { isSinglePerson: true } });
    expect(mapped.isSinglePerson).toBe(true);
  });

  it("reportsToId absent as a key -> treated as root (null), not as `in` would suggest", () => {
    const unit: HrmOrgUnit = { id: 1 };
    expect("reportsToId" in unit).toBe(false);
    expect(mapOrgUnit(unit).parentHrmId).toBeNull();
  });

  it("throws when id is missing", () => {
    expect(() => mapOrgUnit({})).toThrow();
  });

  it("maps every real (anonymized) org-unit fixture without throwing", () => {
    for (const unit of orgUnits) {
      const mapped = mapOrgUnit(unit);
      expect(mapped.hrmId).toBe(unit.id);
    }
  });

  it("a fixture unit with a DELETED type resolves isActive: false", () => {
    const deletedType = orgUnits.find((u) => u.orgUnitTypeDto?.lifecycleStatus === "DELETED");
    expect(deletedType).toBeDefined();
    expect(mapOrgUnit(deletedType as HrmOrgUnit).isActive).toBe(false);
  });
});

describe("resolveManagerialLevel", () => {
  const dicts = (code?: string, translation?: string) => ({
    managerialLevelCode: new Map(code ? [["lvl", code]] : []),
    managerialLevel: new Map(translation ? [["lvl", translation]] : []),
  });

  it("returns null when the employee has no managerial level", () => {
    expect(resolveManagerialLevel({ managerialLevelId: null }, dicts("M2"))).toBeNull();
  });

  it("normalizes every spelling HRM uses to a bare M<n>", () => {
    for (const raw of ["M2", "M_2", "M 2", "m-2"]) {
      expect(resolveManagerialLevel({ managerialLevelId: "lvl" }, dicts(raw))).toBe("M2");
    }
  });

  it("prefers the stable code over the locale translation", () => {
    expect(resolveManagerialLevel({ managerialLevelId: "lvl" }, dicts("M3", "M4"))).toBe("M3");
  });

  it("falls back to the translation when there is no code", () => {
    expect(resolveManagerialLevel({ managerialLevelId: "lvl" }, dicts(undefined, "M5"))).toBe("M5");
  });

  it("maps HRM's NOT_DEFINED (and any other non-M value) to null", () => {
    expect(resolveManagerialLevel({ managerialLevelId: "lvl" }, dicts("NOT_DEFINED", "Not defined"))).toBeNull();
  });

  it("still finds the M-level in the translation when only the code is unusable", () => {
    expect(resolveManagerialLevel({ managerialLevelId: "lvl" }, dicts("NOT_DEFINED", "M4"))).toBe("M4");
  });

  it("returns null for an id that is in no dictionary", () => {
    expect(resolveManagerialLevel({ managerialLevelId: "missing" }, dicts("M2"))).toBeNull();
  });
});

describe("mapManagerChain", () => {
  it("keeps only the levels HRM populated with an id, numbered M1..M5", () => {
    const chain = mapManagerChain({
      // HRM sends the key for every level regardless — managerM1 here is the
      // real live shape for "no M1": an object with no id.
      managerM1: { firstNameEn: "Nobody" },
      managerM3: { id: 30 },
      managerM5: { id: 50 },
    });
    expect(chain).toEqual([
      { level: 3, hrmManagerId: 30 },
      { level: 5, hrmManagerId: 50 },
    ]);
  });

  it("is empty when no level is populated", () => {
    expect(mapManagerChain({})).toEqual([]);
  });
});

describe("resolveOrgUnitParents", () => {
  const personType = { id: 5, orgUnitTypeNameEn: "Person" };
  const unitType = { id: 6, orgUnitTypeNameEn: "Unit" };
  const teamType = { id: 2, orgUnitTypeNameEn: "Team" };

  it("reads reportsToId as an EMPLOYEE id when the parent type is Person", () => {
    // The live shape: "Global Development" [Unit] declares a Person parent and
    // carries employee id 791 — the head of the "GDO & DMO" Person unit, NOT
    // org unit 791, which is an unrelated Team.
    const parents = resolveOrgUnitParents([
      { id: 996, orgUnitName: "GDO & DMO", orgUnitTypeId: 5, headId: 791, orgUnitTypeDto: personType },
      { id: 791, orgUnitName: "Java VOKA", orgUnitTypeId: 2, headId: 12, orgUnitTypeDto: teamType },
      {
        id: 5,
        orgUnitName: "Global Development",
        orgUnitTypeId: 6,
        reportsToId: 791,
        reportsToOrgUnitTypeId: 5,
        orgUnitTypeDto: unitType,
      },
    ]);
    expect(parents.get(5)).toBe(996);
  });

  it("reads reportsToId as an ORG UNIT id for every other parent type", () => {
    const parents = resolveOrgUnitParents([
      { id: 935, orgUnitName: "Development Team VOKA", orgUnitTypeId: 4, orgUnitTypeDto: { id: 4, orgUnitTypeNameEn: "Division" } },
      {
        id: 791,
        orgUnitName: "Java VOKA",
        orgUnitTypeId: 2,
        reportsToId: 935,
        reportsToOrgUnitTypeId: 4,
        orgUnitTypeDto: teamType,
      },
    ]);
    expect(parents.get(791)).toBe(935);
  });

  it("a Person unit pointing at its own head is the top, not a one-node cycle", () => {
    const parents = resolveOrgUnitParents([
      {
        id: 1,
        orgUnitName: "CEO",
        orgUnitTypeId: 5,
        headId: 528,
        reportsToId: 528,
        reportsToOrgUnitTypeId: 5,
        orgUnitTypeDto: personType,
      },
    ]);
    expect(parents.get(1)).toBeNull();
  });

  it("an unresolvable reference is null, not a wrong parent", () => {
    const parents = resolveOrgUnitParents([
      { id: 10, orgUnitName: "Orphan", orgUnitTypeId: 2, reportsToId: 999, reportsToOrgUnitTypeId: 6, orgUnitTypeDto: teamType },
    ]);
    expect(parents.get(10)).toBeNull();
  });

  it("a unit with no reportsToId at all is a root", () => {
    const parents = resolveOrgUnitParents([
      { id: 10, orgUnitName: "Root", orgUnitTypeId: 6, orgUnitTypeDto: unitType },
    ]);
    expect(parents.get(10)).toBeNull();
  });
});
