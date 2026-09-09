/**
 * HRM dictionary translations (professionalLevel, jobTitle, employeeStatus),
 * collapsed into `Map<valueId, translation>`.
 *
 * Dictionary names are known ahead of time and hardcoded — a separate
 * `GET /dictionaries` call to discover names isn't needed.
 *
 * RISK #1 (see S01 plan): `defaultLanguageOnly=false` returns one row per
 * `languageId` for every value, so collapsing naively into a Map is
 * last-write-wins over an unordered array — the same `valueId` can resolve
 * to "Middle" on one run and "Мидл" on the next. `buildDictionaryMaps` makes
 * that collapse deterministic: candidates for a `valueId` are ordered by
 * (match with the optional HRM_DICT_LANGUAGE_ID) -> orderValue -> array
 * index, and we take the first. Every `valueId` that produced more than one
 * DISTINCT translation is counted as a collision and surfaced in
 * HrmDictionaryLoadInfo — printed by hrm-ping and `log.warn`'d when nonzero.
 *
 * No TTL cache here on purpose: S03 owns the cache-on-login-path decision
 * explicitly, and a second cache here would be a second invalidation story.
 */
import { hrmFetch } from "@/lib/hrm/http";
import { hrmConfig } from "@/lib/hrm/config";
import { log } from "@/lib/logger";
import {
  HRM_DICTIONARY_NAMES,
  type HrmDictionaryEntry,
  type HrmDictionaryResponse,
} from "@/lib/hrm/types";

const DICTIONARIES_PATH = "/api/employee-management/api/v1/dictionaries";

export interface HrmDictionaries {
  professionalLevel: Map<string, string>;
  jobTitle: Map<string, string>;
  employeeStatus: Map<string, string>;
}

export interface HrmDictionaryLoadInfo {
  collisions: number;
  sizes: Record<string, number>;
}

/** Raw grouped response, unmodified. Needed by S04's exploration for fixtures. */
export async function fetchDictionaryTranslations(): Promise<HrmDictionaryResponse> {
  const query = {
    filter: JSON.stringify({ name: [...HRM_DICTIONARY_NAMES] }),
    defaultLanguageOnly: "false",
  };
  return hrmFetch<HrmDictionaryResponse>(DICTIONARIES_PATH, { query, method: "GET" });
}

function pickBest(
  entries: HrmDictionaryEntry[],
  preferredLanguageId: string | undefined
): { translation: string; distinct: number } | null {
  const withIndex = entries
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => typeof e.translation === "string" && e.translation.length > 0);
  if (withIndex.length === 0) return null;

  const distinctTranslations = new Set(withIndex.map(({ e }) => e.translation));

  withIndex.sort((a, b) => {
    const aMatch = preferredLanguageId && a.e.languageId === preferredLanguageId ? 0 : 1;
    const bMatch = preferredLanguageId && b.e.languageId === preferredLanguageId ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const aOrder = a.e.orderValue ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.e.orderValue ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.index - b.index;
  });

  return { translation: withIndex[0].e.translation as string, distinct: distinctTranslations.size };
}

/** Pure: grouped response -> Maps. Exported so S03 can test it against a fixture with no network. */
export function buildDictionaryMaps(
  raw: HrmDictionaryResponse,
  preferredLanguageId?: string
): { dictionaries: HrmDictionaries; info: HrmDictionaryLoadInfo } {
  const dictionaries: HrmDictionaries = {
    professionalLevel: new Map(),
    jobTitle: new Map(),
    employeeStatus: new Map(),
  };
  const sizes: Record<string, number> = {};
  let collisions = 0;

  for (const name of HRM_DICTIONARY_NAMES) {
    const entries = raw[name] ?? [];
    const byValueId = new Map<string, HrmDictionaryEntry[]>();
    for (const entry of entries) {
      if (!entry.valueId) continue;
      const list = byValueId.get(entry.valueId) ?? [];
      list.push(entry);
      byValueId.set(entry.valueId, list);
    }

    const target = dictionaries[name];
    for (const [valueId, candidates] of byValueId) {
      const best = pickBest(candidates, preferredLanguageId);
      if (!best) continue;
      target.set(valueId, best.translation);
      if (best.distinct > 1) collisions++;
    }
    sizes[name] = target.size;
  }

  return { dictionaries, info: { collisions, sizes } };
}

export async function loadDictionaries(): Promise<HrmDictionaries> {
  const { dictionaries } = await loadDictionariesWithInfo();
  return dictionaries;
}

export async function loadDictionariesWithInfo(): Promise<{
  dictionaries: HrmDictionaries;
  info: HrmDictionaryLoadInfo;
}> {
  const raw = await fetchDictionaryTranslations();
  const preferredLanguageId = readDictLanguageId();
  const result = buildDictionaryMaps(raw, preferredLanguageId);
  if (result.info.collisions > 0) {
    log.warn("hrm: dictionary translation collisions", { ...result.info });
  }
  return result;
}

/** HRM_DICT_LANGUAGE_ID is optional tuning, not a required secret — read directly, not via hrmConfig(). */
function readDictLanguageId(): string | undefined {
  const raw = process.env.HRM_DICT_LANGUAGE_ID;
  return raw && raw.trim() ? raw.trim() : undefined;
}
