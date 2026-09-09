import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HRM_GRADE_MAP } from "@/lib/hrm/grade-map";
import { buildDictionaryMaps } from "@/lib/hrm/dictionaries";
import { resolveGrade } from "@/lib/hrm/mapping";
import { GRADE_VALUES } from "@/lib/grades";
import type { HrmDictionaryResponse } from "@/lib/hrm/types";

// Real professionalLevel dictionary from a live stage pull, trimmed to the
// three dictionaries S03 uses (see scripts/anonymize-hrm-fixtures.ts).
const raw = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/hrm/dictionaries.json"), "utf-8")
) as HrmDictionaryResponse;
const { dictionaries } = buildDictionaryMaps(raw);

const ALL_14_CODES = [
  "TRAINEE",
  "INTERN",
  "JUNIOR_MINUS",
  "JUNIOR",
  "JUNIOR_PLUS",
  "MIDDLE_MINUS",
  "MIDDLE",
  "MIDDLE_PLUS",
  "SENIOR_MINUS",
  "SENIOR",
  "SENIOR_PLUS",
  "LEAD",
  "ARCHITECT",
  "OTHER",
];

describe("HRM_GRADE_MAP", () => {
  it("has an entry for all 14 confirmed professionalLevel codes, no more, no fewer", () => {
    expect(Object.keys(HRM_GRADE_MAP).sort()).toEqual([...ALL_14_CODES].sort());
  });

  it("maps every non-null entry to a value from GRADE_VALUES", () => {
    for (const [code, grade] of Object.entries(HRM_GRADE_MAP)) {
      if (grade === null) continue;
      expect(GRADE_VALUES as readonly string[]).toContain(grade);
      void code;
    }
  });

  it("leaves ARCHITECT and OTHER unmapped", () => {
    expect(HRM_GRADE_MAP.ARCHITECT).toBeNull();
    expect(HRM_GRADE_MAP.OTHER).toBeNull();
  });

  it("maps LEAD to sen+ (top of the existing scale)", () => {
    expect(HRM_GRADE_MAP.LEAD).toBe("sen+");
  });
});

describe("resolveGrade (against the real professionalLevel dictionary fixture)", () => {
  it("has all 14 codes present in the fixture dictionary, keyed by id", () => {
    // Every code HRM_GRADE_MAP knows about must actually resolve through the
    // fixture's id->code map, or this whole test file is checking nothing.
    const codesInFixture = new Set(dictionaries.professionalLevelCode.values());
    for (const code of ALL_14_CODES) {
      expect(codesInFixture.has(code)).toBe(true);
    }
  });

  it.each(ALL_14_CODES)("resolves code %s to HRM_GRADE_MAP's value, with an issue iff null", (code) => {
    const levelId = [...dictionaries.professionalLevelCode.entries()].find(([, v]) => v === code)?.[0];
    expect(levelId).toBeDefined();
    const { grade, issue } = resolveGrade({ professionalLevelId: levelId, id: 1, email: "a@b.com" }, dictionaries);
    expect(grade).toBe(HRM_GRADE_MAP[code]);
    if (HRM_GRADE_MAP[code] === null) {
      expect(issue).not.toBeNull();
      expect(issue?.kind).toBe("GRADE_UNMAPPED");
    } else {
      expect(issue).toBeNull();
    }
  });

  it("an id not present in the dictionary at all -> null grade + issue", () => {
    const { grade, issue } = resolveGrade(
      { professionalLevelId: "00000000-0000-0000-0000-000000000000", id: 42, email: "x@y.com" },
      dictionaries
    );
    expect(grade).toBeNull();
    expect(issue).not.toBeNull();
    expect(issue?.kind).toBe("GRADE_UNMAPPED");
    expect(issue?.hrmEmployeeId).toBe(42);
  });

  it("no professionalLevelId at all -> null grade, no issue (not an error, just unassigned)", () => {
    const { grade, issue } = resolveGrade({ professionalLevelId: null, id: 1, email: "a@b.com" }, dictionaries);
    expect(grade).toBeNull();
    expect(issue).toBeNull();
  });
});
