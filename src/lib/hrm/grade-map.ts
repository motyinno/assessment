/**
 * HRM `professionalLevel` -> product `Grade`. The single table `resolveGrade()`
 * (mapping.ts) reads from.
 *
 * The key is the dictionary value's stable CODE (`HrmDictionaryValue.value`,
 * e.g. `"JUNIOR_MINUS"`) — not its `translation` (locale text, which has
 * formatting quirks like a space before the dash in "Junior -" and is
 * fragile to compare against).
 *
 * Confirmed against a live stage dump (`temp/hrm-payloads/dictionaries.raw.json`,
 * dictionary `professionalLevel`, id `206216fd-c583-41e2-ba6b-ea42d3f82393`):
 * all 14 codes below, already carrying +/- modifiers. The earlier assumption
 * ("HRM has no +/-, only plain Junior/Middle/Senior") was wrong — see
 * `temp/specs/S03-field-policy-PLAN.md`.
 */
import type { Grade } from "@/lib/grades";

export const HRM_GRADE_MAP: Record<string, Grade | null> = {
  TRAINEE: "Trainee",
  INTERN: "Intern",
  JUNIOR_MINUS: "jun-",
  JUNIOR: "jun",
  JUNIOR_PLUS: "jun+",
  MIDDLE_MINUS: "mid-",
  MIDDLE: "mid",
  MIDDLE_PLUS: "mid+",
  SENIOR_MINUS: "sen-",
  SENIOR: "sen",
  SENIOR_PLUS: "sen+",
  // No direct product equivalent; treated as the top of the existing scale,
  // continuing the historical choice in prisma/seed.ts:GRADE_MAP ("Lead" -> "sen+").
  LEAD: "sen+",
  // New relative to the product's grade scale (GRADE_VALUES tops out at
  // "sen+"). Left unmapped rather than guessed — see plan risks: if HRM
  // really has architects, that's a product decision, not a mapping one.
  ARCHITECT: null,
  OTHER: null,
};
