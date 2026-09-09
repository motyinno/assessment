/**
 * One-off script: `temp/hrm-payloads/*.raw.json` (real stage data, gitignored,
 * see temp/hrm-payloads/README.md) -> small, anonymized fixtures under
 * `tests/fixtures/hrm/`, safe to commit.
 *
 * What it does:
 * - Picks a small, DELIBERATELY varied slice (0/1/3 orgUnits, manager
 *   present/absent, patronymicRu missing, DELETED lifecycle, etc.) rather
 *   than the first N records — the point of real fixtures is covering shapes
 *   a hand-written one would miss, so picking blindly would defeat that.
 * - Replaces every name/email with synthetic values (stable per hrmEmployeeId
 *   so the same fake person appears consistently across `manager` refs).
 * - Strips `linkProfilePicture(Mini)` entirely — those are live, ~5-minute
 *   signed S3 URLs, not something to freeze into a committed fixture.
 * - Trims `dictionaries.raw.json` (21MB, 228 dictionaries) down to the 3
 *   HRM_DICTIONARY_NAMES actually used, values intact (needed whole — the
 *   professionalLevel table is exactly what grade-map.ts is keyed against).
 *
 * Not run automatically, not part of `npm test` — a one-off tool, kept only
 * in case the fixtures need regenerating from a fresh stage pull.
 *
 * Usage: tsx scripts/anonymize-hrm-fixtures.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RAW_DIR = join(process.cwd(), "temp", "hrm-payloads");
const OUT_DIR = join(process.cwd(), "tests", "fixtures", "hrm");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = Record<string, any>;

const FIRST_NAMES_EN = ["Alex", "Sam", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Jamie"];
const LAST_NAMES_EN = ["Ivanov", "Petrov", "Smirnov", "Novak", "Kowalski", "Popov", "Sokolov", "Volkov"];

function syntheticName(seed: number): { firstNameEn: string; lastNameEn: string; firstNameRu: string; lastNameRu: string; email: string } {
  const firstNameEn = FIRST_NAMES_EN[seed % FIRST_NAMES_EN.length];
  const lastNameEn = LAST_NAMES_EN[Math.floor(seed / FIRST_NAMES_EN.length) % LAST_NAMES_EN.length];
  return {
    firstNameEn,
    lastNameEn,
    firstNameRu: firstNameEn, // fixtures don't need real Cyrillic to be useful
    lastNameRu: lastNameEn,
    email: `${firstNameEn.toLowerCase()}.${lastNameEn.toLowerCase()}.${seed}@example.test`,
  };
}

function anonymizeShortInfo(info: AnyRec | undefined | null): AnyRec | undefined | null {
  if (!info || typeof info !== "object") return info;
  const seed = typeof info.id === "number" ? info.id : 0;
  const name = syntheticName(seed);
  return {
    ...info,
    ...(info.id !== undefined ? { firstNameEn: name.firstNameEn, lastNameEn: name.lastNameEn, firstNameRu: name.firstNameRu, lastNameRu: name.lastNameRu } : {}),
    ...(info.email !== undefined ? { email: name.email } : {}),
    linkProfilePicture: "",
    linkProfilePictureMini: "",
  };
}

function anonymizeEmployee(e: AnyRec): AnyRec {
  const seed = typeof e.id === "number" ? e.id : 0;
  const name = syntheticName(seed);
  const out: AnyRec = {
    ...e,
    firstNameEn: name.firstNameEn,
    lastNameEn: name.lastNameEn,
    firstNameRu: name.firstNameRu,
    lastNameRu: name.lastNameRu,
    email: name.email,
    linkProfilePicture: "",
    linkProfilePictureMini: "",
  };
  delete out.patronymicRu;
  for (const key of ["manager", "managerM1", "managerM2", "managerM3", "managerM4", "managerM5", "head"]) {
    if (out[key]) out[key] = anonymizeShortInfo(out[key]);
  }
  if (Array.isArray(out.employeeManagers)) {
    out.employeeManagers = out.employeeManagers.map((entry: AnyRec) => ({
      ...entry,
      manager: anonymizeShortInfo(entry.manager),
    }));
  }
  // Fields not needed by S03's mapping and heavy/noisy to keep around.
  for (const key of [
    "employeeContract",
    "employeeLanguageSkills",
    "employeeMilitaryService",
    "employeeContactInformation",
    "companyExperience",
    "internshipPeriod",
  ]) {
    delete out[key];
  }
  return out;
}

function loadEmployees(fileName: string): AnyRec[] {
  const raw = JSON.parse(readFileSync(join(RAW_DIR, fileName), "utf-8"));
  const pages: AnyRec[] = Array.isArray(raw) ? raw : [raw];
  return pages.flatMap((p) => p.content ?? []);
}

function pickVariedEmployees(all: AnyRec[]): AnyRec[] {
  const byOrgUnitCount = (n: number) => all.find((e) => (e.orgUnits ?? []).length === n);
  const withManager = all.find((e) => e.manager && e.manager.id);
  const withoutManager = all.find((e) => !e.manager);
  const noPatronymic = all.find((e) => !("patronymicRu" in e));

  const picked = new Map<number, AnyRec>();
  for (const candidate of [byOrgUnitCount(0), byOrgUnitCount(1), byOrgUnitCount(3), withManager, withoutManager, noPatronymic]) {
    if (candidate && typeof candidate.id === "number") picked.set(candidate.id, candidate);
  }
  // Guarantee at least a handful even if some predicates found nothing.
  for (const e of all.slice(0, 4)) {
    if (typeof e.id === "number") picked.set(e.id, e);
  }
  return [...picked.values()];
}

function buildEmployeeFixtures(): Set<string> {
  const actual = pickVariedEmployees(loadEmployees("employees-actual.raw.json")).map(anonymizeEmployee);
  const deleted = pickVariedEmployees(loadEmployees("employees-deleted.raw.json"))
    .slice(0, 2)
    .map(anonymizeEmployee);

  writeFileSync(join(OUT_DIR, "employees-actual.json"), JSON.stringify(actual, null, 2) + "\n");
  writeFileSync(join(OUT_DIR, "employees-deleted.json"), JSON.stringify(deleted, null, 2) + "\n");
  console.log(`wrote ${actual.length} actual + ${deleted.length} deleted employee fixtures`);

  const jobTitleIds = new Set<string>();
  for (const e of [...actual, ...deleted]) {
    if (e.jobTitleId) jobTitleIds.add(e.jobTitleId);
  }
  return jobTitleIds;
}

function buildOrgUnitsFixture() {
  const raw = JSON.parse(readFileSync(join(RAW_DIR, "org-units.raw.json"), "utf-8"));
  const list: AnyRec[] = raw?.data?.orgUnitDtoList ?? [];
  const byPredicate = (pred: (u: AnyRec) => boolean) => list.find(pred);

  const picked = new Map<number, AnyRec>();
  for (const candidate of [
    byPredicate((u) => u.orgUnitTypeDto?.lifecycleStatus === "DELETED"),
    byPredicate((u) => u.orgUnitTypeDto?.isSinglePerson === true),
    byPredicate((u) => u.reportsToId === undefined || u.reportsToId === null),
    byPredicate((u) => typeof u.reportsToId === "number"),
    ...list.slice(0, 3),
  ]) {
    if (candidate && typeof candidate.id === "number") picked.set(candidate.id, candidate);
  }

  const out = [...picked.values()].map((u) => ({ ...u, head: undefined, deputy: undefined, resourceManager: undefined, reportsTo: undefined }));
  writeFileSync(join(OUT_DIR, "org-units.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${out.length} org-unit fixtures`);
}

/**
 * `professionalLevel` is kept WHOLE (only 14 values — it's the exact table
 * grade-map.ts is keyed against, trimming it would defeat the fixture's
 * purpose). `jobTitle` (214 values) and `employeeStatus` are trimmed down to
 * just the ids the employee fixtures actually reference, plus a couple extra
 * so "id not in dictionary" is also exercisable.
 */
function buildDictionariesFixture(referencedJobTitleIds: Set<string>) {
  const raw = JSON.parse(readFileSync(join(RAW_DIR, "dictionaries.raw.json"), "utf-8")) as AnyRec[];
  const filtered = raw
    .filter((d) => ["professionalLevel", "jobTitle", "employeeStatus"].includes(d.name))
    .map((d) => {
      if (d.name !== "jobTitle") return d;
      const kept = (d.values ?? []).filter((v: AnyRec, i: number) => referencedJobTitleIds.has(v.id) || i < 2);
      return { ...d, values: kept };
    });
  writeFileSync(join(OUT_DIR, "dictionaries.json"), JSON.stringify(filtered, null, 2) + "\n");
  console.log(`wrote dictionaries fixture: ${filtered.map((d) => `${d.name}=${d.values?.length ?? 0}`).join(", ")}`);
}

mkdirSync(OUT_DIR, { recursive: true });
const jobTitleIds = buildEmployeeFixtures();
buildOrgUnitsFixture();
buildDictionariesFixture(jobTitleIds);
