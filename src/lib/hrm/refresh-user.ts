/**
 * Best-effort, single-person refresh from HRM, called on every login
 * (`src/lib/auth.ts`'s `signIn` callback). Closes the "new hire signs in on
 * day one, before the first nightly sync runs" gap.
 *
 * Policy is NOT reimplemented here — `buildUserWrite()` (apply-user.ts) is
 * the only function allowed to decide what gets written, same as the nightly
 * sync (S04). This file only orchestrates: fetch, map, write, best-effort.
 *
 * Failure policy is the opposite of the nightly sync (see 06-ARCHITECTURE.md
 * §6.2's abort-on-mass-failure guard): a login must never be blocked by HRM
 * being down, misconfigured, or slow. Every step from the network call
 * onward is wrapped in one try/catch that only logs and returns.
 */
import prisma from "@/lib/prisma";
import { hrmConfig, hrmSyncEnabled } from "@/lib/hrm/config";
import { searchEmployees } from "@/lib/hrm/employees";
import { loadDictionaries, type HrmDictionaries } from "@/lib/hrm/dictionaries";
import { mapEmployee } from "@/lib/hrm/mapping";
import { buildUserWrite } from "@/lib/hrm/apply-user";
import { log } from "@/lib/logger";

const DICTIONARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1h — see dictionaries.ts's note: this file owns the cache-on-login decision.

let dictCache: { dicts: HrmDictionaries; loadedAtMs: number } | null = null;

async function getCachedDictionaries(): Promise<HrmDictionaries> {
  if (dictCache && Date.now() - dictCache.loadedAtMs < DICTIONARY_CACHE_TTL_MS) {
    return dictCache.dicts;
  }
  const dicts = await loadDictionaries();
  dictCache = { dicts, loadedAtMs: Date.now() };
  return dicts;
}

/** Test-only: force the next call to reload dictionaries instead of using the cache. */
export function resetDictionaryCacheForTests(): void {
  dictCache = null;
}

/**
 * Fetches the employee by email, maps it, and writes it via `buildUserWrite()`.
 * Never throws — any failure (HRM unreachable, shape error, DB error) is
 * logged as a warning and swallowed so the sign-in this is called from always
 * proceeds.
 */
export async function refreshEmployeeByEmail(email: string): Promise<void> {
  if (!hrmSyncEnabled()) return;

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const page = await searchEmployees({
      email: normalizedEmail,
      size: 1,
      timeoutMs: hrmConfig().loginTimeoutMs,
    });
    const found = page.items[0];
    // Not found in HRM: leave hrmSyncedAt untouched. This person shows up as
    // "not found" in the exceptions view (S07) — it's not this function's
    // job to guess why.
    if (!found) return;

    const dicts = await getCachedDictionaries();
    const { employee: mapped, issues } = mapEmployee(found, dicts);
    for (const issue of issues) {
      log.warn("hrm: mapping issue during login refresh", { ...issue });
    }

    const existing = await prisma.user.findUnique({
      where: { email: mapped.email },
      select: { id: true, grade: true },
    });

    const write = buildUserWrite(mapped, existing ? { grade: existing.grade } : null);

    let userId: string;
    if (write.create) {
      const created = await prisma.user.create({ data: write.create, select: { id: true } });
      userId = created.id;
    } else if (write.update && existing) {
      await prisma.user.update({ where: { id: existing.id }, data: write.update });
      userId = existing.id;
    } else {
      return;
    }

    // Manager link: resolved only if that manager already exists locally by
    // hrmEmployeeId. Full resolution (creating the link the other way round,
    // once the manager syncs later) is a second pass owned by S04.
    if (mapped.hrmManagerId !== null) {
      const manager = await prisma.user.findUnique({
        where: { hrmEmployeeId: mapped.hrmManagerId },
        select: { id: true },
      });
      if (manager) {
        await prisma.user.update({ where: { id: userId }, data: { managerId: manager.id } });
      }
    }

    // Department memberships from orgUnits[].id -> Department.hrmId. Only
    // ADDS rows for units that have already synced; it never removes a
    // membership — reconciling stale memberships (a person moved units) is
    // the nightly sync's job, not this best-effort, request-scoped path's.
    if (mapped.orgUnitIds.length > 0) {
      const departments = await prisma.department.findMany({
        where: { hrmId: { in: mapped.orgUnitIds } },
        select: { id: true },
      });
      if (departments.length > 0) {
        await prisma.userDepartment.createMany({
          data: departments.map((d) => ({ userId, departmentId: d.id })),
          skipDuplicates: true,
        });
      }
    }
  } catch (e) {
    log.warn("hrm: refreshEmployeeByEmail failed, sign-in proceeds anyway", {
      email,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
