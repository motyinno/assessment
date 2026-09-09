/**
 * HRM dictionary translations (professionalLevel, jobTitle, employeeStatus),
 * collapsed into `Map<valueId, translation>`.
 *
 * Endpoint and shape confirmed against stage/swagger:
 * `GET /api/dictionaries/api/v2/dictionaries` returns an ARRAY of
 * dictionaries (one object per name), and each dictionary's values carry
 * their translations NESTED at `values[].translations[]` — not the flat
 * `{ [name]: HrmDictionaryEntry[] }` originally assumed from the integration
 * doc before this was checked against a live response.
 *
 * Dictionary names are known ahead of time and hardcoded — a separate call
 * to discover names isn't needed; `filter` still narrows the response to
 * just the three we use.
 *
 * RISK #1 (see S01 plan): `defaultLanguageOnly=false` returns one translation
 * row per `languageId` for every value, so collapsing naively into a Map is
 * last-write-wins over an unordered array — the same value can resolve to
 * "Middle" on one run and "Мидл" on the next. `buildDictionaryMaps` makes
 * that collapse deterministic: candidates for a value are ordered by (match
 * with the optional HRM_DICT_LANGUAGE_ID) -> orderValue -> array index, and
 * we take the first. Every value that produced more than one DISTINCT
 * translation is counted as a collision and surfaced in
 * HrmDictionaryLoadInfo — printed by hrm-ping and `log.warn`'d when nonzero.
 *
 * No TTL cache here on purpose: S03 owns the cache-on-login-path decision
 * explicitly, and a second cache here would be a second invalidation story.
 */
import { hrmFetch } from "@/lib/hrm/http";
import { log } from "@/lib/logger";
import {
  HRM_DICTIONARY_NAMES,
  type HrmDictionaryResponse,
  type HrmDictionaryValueTranslation,
} from "@/lib/hrm/types";

const DICTIONARIES_PATH = "/api/dictionaries/api/v2/dictionaries";

export interface HrmDictionaries {
  professionalLevel: Map<string, string>;
  jobTitle: Map<string, string>;
  employeeStatus: Map<string, string>;
}

export interface HrmDictionaryLoadInfo {
  collisions: number;
  sizes: Record<string, number>;
}

/** Raw array response, unmodified. Needed by S04's exploration for fixtures. */
export async function fetchDictionaryTranslations(): Promise<HrmDictionaryResponse> {
  const query = {
    filter: JSON.stringify({ name: [...HRM_DICTIONARY_NAMES] }),
    defaultLanguageOnly: "false",
  };
  return hrmFetch<HrmDictionaryResponse>(DICTIONARIES_PATH, { query, method: "GET" });
}

function pickBest(
  candidates: HrmDictionaryValueTranslation[],
  preferredLanguageId: string | undefined
): { translation: string; distinct: number } | null {
  const withIndex = candidates
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => typeof c.translation === "string" && c.translation.length > 0);
  if (withIndex.length === 0) return null;

  const distinctTranslations = new Set(withIndex.map(({ c }) => c.translation));

  withIndex.sort((a, b) => {
    const aMatch = preferredLanguageId && a.c.languageId === preferredLanguageId ? 0 : 1;
    const bMatch = preferredLanguageId && b.c.languageId === preferredLanguageId ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    const aOrder = a.c.orderValue ?? Number.MAX_SAFE_INTEGER;
    const bOrder = b.c.orderValue ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.index - b.index;
  });

  return { translation: withIndex[0].c.translation as string, distinct: distinctTranslations.size };
}

/** Pure: raw dictionary array -> Maps. Exported so S03 can test it against a fixture with no network. */
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
    const dict = raw.find((d) => d.name === name);
    const target = dictionaries[name];

    for (const value of dict?.values ?? []) {
      const valueId = value.id ?? value.translations?.find((t) => t.valueId)?.valueId;
      if (!valueId) continue;
      const best = pickBest(value.translations ?? [], preferredLanguageId);
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
