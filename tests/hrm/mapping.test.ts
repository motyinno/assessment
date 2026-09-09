import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { displayName, mapEmployee, mapOrgUnit, rawManagerId } from "@/lib/hrm/mapping";
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
  it("reads manager.id when present", () => {
    expect(rawManagerId({ manager: { id: 42 } })).toBe(42);
  });

  it("returns null when manager has no id (empty object)", () => {
    expect(rawManagerId({ manager: {} })).toBeNull();
  });

  it("returns null when manager is entirely absent", () => {
    expect(rawManagerId({ manager: undefined })).toBeNull();
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
