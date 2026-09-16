/**
 * Discovery run (S04 plan §"Discovery run"): full crawl, NO WRITE, a
 * report on the table before the first ever writing sync. Answers the six
 * open questions the plan lists — grade dictionary values, manager-field
 * coverage, multi-membership distribution, org-unit types, email match
 * against the current 143 local users, and manager-link agreement.
 *
 * Usage: npm run hrm:discover
 *
 * Writes: stdout (markdown tables), temp/specs/reports/discovery-YYYY-MM-DD.md,
 * and one HrmSyncRun row (status: DRY_RUN, trigger: MANUAL, dryRun: true,
 * report: <json>) — reuses the field `runHrmSync`'s own dry-run branch
 * writes to, rather than a separate column.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import prisma from "@/lib/prisma";
import { hrmConfig, hrmConfigIssues } from "@/lib/hrm/config";
import { fetchOrgUnits } from "@/lib/hrm/org-units";
import { loadDictionariesWithInfo } from "@/lib/hrm/dictionaries";
import { searchEmployees } from "@/lib/hrm/employees";
import { mapEmployee, rawManagerId } from "@/lib/hrm/mapping";
import type { HrmDictionaries } from "@/lib/hrm/dictionaries";
import type { HrmEmployee, HrmOrgUnit } from "@/lib/hrm/types";

interface Section {
  title: string;
  lines: string[];
}

function section(title: string, lines: string[]): Section {
  return { title, lines };
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

/** §1 — every professionalLevel/jobTitle dictionary value with how many people carry it. */
function reportGradeDictionary(dicts: HrmDictionaries, employees: HrmEmployee[]): Section {
  const byLevel = new Map<string, number>();
  for (const e of employees) {
    const id = e.professionalLevelId;
    if (!id) continue;
    byLevel.set(id, (byLevel.get(id) ?? 0) + 1);
  }
  const lines = [
    "| professionalLevelId | translation | code | count |",
    "|---|---|---|---|",
  ];
  for (const [id, translation] of dicts.professionalLevel) {
    const code = dicts.professionalLevelCode.get(id) ?? "";
    lines.push(`| ${id} | ${translation} | ${code} | ${byLevel.get(id) ?? 0} |`);
  }
  return section("1. Grade dictionary (professionalLevel)", lines);
}

/** §2 — how full each manager-ish field is, across the full crawl. */
function reportManagerFieldCoverage(employees: HrmEmployee[]): Section {
  const total = employees.length;
  const fields: Array<[string, (e: HrmEmployee) => boolean]> = [
    ["manager.id", (e) => rawManagerId(e) !== null],
    ["managerM1.id", (e) => !!e.managerM1?.id],
    ["managerM2.id", (e) => !!e.managerM2?.id],
    ["managerM3.id", (e) => !!e.managerM3?.id],
    ["managerM4.id", (e) => !!e.managerM4?.id],
    ["managerM5.id", (e) => !!e.managerM5?.id],
    ["head.id", (e) => !!e.head?.id],
  ];
  const lines = ["| field | filled | total | % |", "|---|---|---|---|"];
  for (const [name, pred] of fields) {
    const filled = employees.filter(pred).length;
    lines.push(`| ${name} | ${filled} | ${total} | ${pct(filled, total)} |`);
  }
  return section("2. Manager field coverage", lines);
}

/** §3 — distribution of "how many orgUnits does a person belong to". */
function reportMultiMembership(employees: HrmEmployee[]): Section {
  const buckets = new Map<number, number>();
  for (const e of employees) {
    const n = (e.orgUnits ?? []).length;
    buckets.set(n, (buckets.get(n) ?? 0) + 1);
  }
  const lines = ["| org units | people | % |", "|---|---|---|"];
  const total = employees.length;
  for (const n of [...buckets.keys()].sort((a, b) => a - b)) {
    lines.push(`| ${n} | ${buckets.get(n)} | ${pct(buckets.get(n)!, total)} |`);
  }
  const avg = total > 0 ? (employees.reduce((s, e) => s + (e.orgUnits ?? []).length, 0) / total).toFixed(2) : "0";
  lines.push("", `Average: ${avg} units/person`);
  return section("3. Multi-membership distribution", lines);
}

/** §4 — org-unit type breakdown: filterable, single-person, empty, DELETED. */
function reportUnitTypes(units: HrmOrgUnit[]): Section {
  const byType = new Map<string, { count: number; filterable: boolean; singlePerson: boolean; deleted: number }>();
  for (const u of units) {
    const type = u.orgUnitTypeDto;
    const name = type?.orgUnitTypeName ?? "(no type)";
    const entry = byType.get(name) ?? {
      count: 0,
      filterable: type?.isFilterable ?? true,
      singlePerson: type?.isSinglePerson ?? false,
      deleted: 0,
    };
    entry.count++;
    if (type?.lifecycleStatus === "DELETED") entry.deleted++;
    byType.set(name, entry);
  }
  const lines = ["| type | count | isFilterable | isSinglePerson | DELETED |", "|---|---|---|---|---|"];
  for (const [name, entry] of byType) {
    lines.push(`| ${name} | ${entry.count} | ${entry.filterable} | ${entry.singlePerson} | ${entry.deleted} |`);
  }
  return section("4. Org unit types", lines);
}

/** §5 — local users not found in HRM by email, and HRM employees with no email. */
async function reportEmailMatch(
  employees: HrmEmployee[]
): Promise<{ section: Section; localUsers: { id: string; email: string; managerId: string | null }[] }> {
  const localUsers = await prisma.user.findMany({ select: { id: true, email: true, managerId: true } });
  const hrmEmails = new Set(
    employees.map((e) => e.email?.trim().toLowerCase()).filter((e): e is string => !!e)
  );
  const noMatch = localUsers.filter((u) => !hrmEmails.has(u.email.trim().toLowerCase()));
  const noEmailInHrm = employees.filter((e) => !e.email || !e.email.trim());

  const lines = [
    `Local users total: ${localUsers.length}`,
    `Local users NOT found in HRM by email: ${noMatch.length}`,
    ...noMatch.slice(0, 30).map((u) => `  - ${u.email}`),
    "",
    `HRM employees with no corporate email: ${noEmailInHrm.length}`,
  ];
  return { section: section("5. Email match (local vs HRM)", lines), localUsers };
}

/** §6 — for local users found in HRM, does their current managerId agree with employee.manager? */
function reportManagerLinkAgreement(
  employees: HrmEmployee[],
  localUsers: { id: string; email: string; managerId: string | null }[]
): Section {
  const byEmail = new Map(employees.map((e) => [e.email?.trim().toLowerCase(), e]).filter(([k]) => !!k) as [string, HrmEmployee][]);
  const localById = new Map(localUsers.map((u) => [u.id, u]));
  const localByEmail = new Map(localUsers.map((u) => [u.email.trim().toLowerCase(), u]));

  let agree = 0;
  let disagree = 0;
  let noHrmManager = 0;
  let userHasNoLocalManager = 0;

  for (const u of localUsers) {
    const emp = byEmail.get(u.email.trim().toLowerCase());
    if (!emp) continue;
    const hrmManagerId = rawManagerId(emp);
    if (hrmManagerId === null) {
      noHrmManager++;
      continue;
    }
    const hrmManagerEmail = emp.manager?.email?.trim().toLowerCase() ?? null;
    const hrmManagerLocal = hrmManagerEmail ? localByEmail.get(hrmManagerEmail) : undefined;
    const localManager = u.managerId ? localById.get(u.managerId) : null;
    if (!localManager) {
      userHasNoLocalManager++;
      continue;
    }
    if (hrmManagerLocal && hrmManagerLocal.id === localManager.id) agree++;
    else disagree++;
  }

  return section("6. Manager link agreement (current managerId vs employee.manager)", [
    `agree: ${agree}`,
    `disagree: ${disagree}`,
    `no manager in HRM: ${noHrmManager}`,
    `local user has no local managerId set: ${userHasNoLocalManager}`,
  ]);
}

async function crawlAllEmployees(): Promise<HrmEmployee[]> {
  const cfg = hrmConfig();
  const all: HrmEmployee[] = [];
  let page = 0;
  for (;;) {
    const result = await searchEmployees({ page, size: cfg.pageSize });
    all.push(...result.items);
    console.log(`  page ${page}: +${result.items.length} (total ${all.length}, hasMore=${result.hasMore})`);
    if (!result.hasMore) break;
    page++;
  }
  return all;
}

function renderMarkdown(sections: Section[]): string {
  const parts = [`# HRM discovery report — ${new Date().toISOString().slice(0, 10)}`, ""];
  for (const s of sections) {
    parts.push(`## ${s.title}`, "", ...s.lines, "");
  }
  return parts.join("\n");
}

async function main() {
  const issues = hrmConfigIssues();
  if (issues.length > 0) {
    console.error("HRM config problems:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }

  console.log("Fetching org units...");
  const orgUnits = await fetchOrgUnits();
  console.log(`  ${orgUnits.length} org units`);

  console.log("Loading dictionaries...");
  const { dictionaries, info } = await loadDictionariesWithInfo();
  console.log(
    `  professionalLevel=${dictionaries.professionalLevel.size} jobTitle=${dictionaries.jobTitle.size} employeeStatus=${dictionaries.employeeStatus.size} collisions=${info.collisions}`
  );

  console.log("Crawling all employees (full pass, no dismissalStatus filter)...");
  const employees = await crawlAllEmployees();
  console.log(`  ${employees.length} employees total`);

  // mapEmployee is used for grouping only — never for writing (this script
  // touches no User/Department rows). Mapping issues are surfaced but not
  // otherwise acted on here.
  let mappingIssueCount = 0;
  for (const e of employees) {
    if (e.id == null || !e.email) continue;
    const { issues: mappingIssues } = mapEmployee(e, dictionaries);
    mappingIssueCount += mappingIssues.length;
  }

  const sections: Section[] = [];
  sections.push(reportGradeDictionary(dictionaries, employees));
  sections.push(reportManagerFieldCoverage(employees));
  sections.push(reportMultiMembership(employees));
  sections.push(reportUnitTypes(orgUnits));
  const { section: emailSection, localUsers } = await reportEmailMatch(employees);
  sections.push(emailSection);
  sections.push(reportManagerLinkAgreement(employees, localUsers));
  sections.push(section("Mapping issues (GRADE_UNMAPPED)", [`count: ${mappingIssueCount}`]));

  const markdown = renderMarkdown(sections);
  console.log("\n" + markdown);

  const outDir = join(process.cwd(), "temp", "specs", "reports");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `discovery-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(outPath, markdown, "utf-8");
  console.log(`\nWritten to ${outPath}`);

  const reportJson = {
    generatedAt: new Date().toISOString(),
    orgUnits: orgUnits.length,
    employees: employees.length,
    dictionaries: {
      professionalLevel: dictionaries.professionalLevel.size,
      jobTitle: dictionaries.jobTitle.size,
      employeeStatus: dictionaries.employeeStatus.size,
      collisions: info.collisions,
    },
    mappingIssueCount,
    localUsersTotal: localUsers.length,
  };
  const run = await prisma.hrmSyncRun.create({
    data: {
      status: "DRY_RUN",
      trigger: "MANUAL",
      dryRun: true,
      finishedAt: new Date(),
      employeesSeen: employees.length,
      departmentsUpserted: orgUnits.length,
      report: reportJson,
    },
  });
  console.log(`HrmSyncRun row: ${run.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
