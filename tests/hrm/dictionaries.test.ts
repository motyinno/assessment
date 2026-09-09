import { describe, expect, it } from "vitest";
import { buildDictionaryMaps } from "@/lib/hrm/dictionaries";
import type { HrmDictionaryResponse } from "@/lib/hrm/types";

describe("buildDictionaryMaps", () => {
  it("builds a Map when there's a single language per value", () => {
    const raw: HrmDictionaryResponse = {
      professionalLevel: [
        { valueId: "pl-1", translation: "Middle", languageId: "en" },
        { valueId: "pl-2", translation: "Senior", languageId: "en" },
      ],
      jobTitle: [{ valueId: "jt-1", translation: "Engineer", languageId: "en" }],
      employeeStatus: [{ valueId: "es-1", translation: "Active", languageId: "en" }],
    };
    const { dictionaries, info } = buildDictionaryMaps(raw);
    expect(dictionaries.professionalLevel.get("pl-1")).toBe("Middle");
    expect(dictionaries.professionalLevel.get("pl-2")).toBe("Senior");
    expect(dictionaries.jobTitle.get("jt-1")).toBe("Engineer");
    expect(dictionaries.employeeStatus.get("es-1")).toBe("Active");
    expect(info.collisions).toBe(0);
    expect(info.sizes).toEqual({ professionalLevel: 2, jobTitle: 1, employeeStatus: 1 });
  });

  it("deterministically collapses multiple languages for one valueId and counts the collision", () => {
    const raw: HrmDictionaryResponse = {
      professionalLevel: [
        { valueId: "pl-1", translation: "Мидл", languageId: "ru", orderValue: 2 },
        { valueId: "pl-1", translation: "Middle", languageId: "en", orderValue: 1 },
      ],
      jobTitle: [],
      employeeStatus: [],
    };
    const first = buildDictionaryMaps(raw);
    const second = buildDictionaryMaps(raw);
    // Same input -> same output, every time (no last-write-wins over an
    // unordered array).
    expect(first.dictionaries.professionalLevel.get("pl-1")).toBe(
      second.dictionaries.professionalLevel.get("pl-1")
    );
    expect(first.dictionaries.professionalLevel.get("pl-1")).toBe("Middle"); // lower orderValue wins
    expect(first.info.collisions).toBe(1);
  });

  it("prefers the entry matching HRM_DICT_LANGUAGE_ID when given, regardless of orderValue", () => {
    const raw: HrmDictionaryResponse = {
      professionalLevel: [
        { valueId: "pl-1", translation: "Middle", languageId: "en", orderValue: 1 },
        { valueId: "pl-1", translation: "Мидл", languageId: "ru", orderValue: 99 },
      ],
      jobTitle: [],
      employeeStatus: [],
    };
    const { dictionaries } = buildDictionaryMaps(raw, "ru");
    expect(dictionaries.professionalLevel.get("pl-1")).toBe("Мидл");
  });

  it("handles an empty group without throwing", () => {
    const raw: HrmDictionaryResponse = { professionalLevel: [], jobTitle: [], employeeStatus: [] };
    const { dictionaries, info } = buildDictionaryMaps(raw);
    expect(dictionaries.professionalLevel.size).toBe(0);
    expect(info.collisions).toBe(0);
  });

  it("handles a missing group key the same as an empty one", () => {
    const raw: HrmDictionaryResponse = {};
    const { dictionaries } = buildDictionaryMaps(raw);
    expect(dictionaries.jobTitle.size).toBe(0);
  });
});
