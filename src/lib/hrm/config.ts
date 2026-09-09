/**
 * HRM environment configuration.
 *
 * INVARIANT: no function in this file (or anywhere under `src/lib/hrm/`) reads
 * `process.env` at module load time — only inside a function body. This is
 * what lets `HRM_SYNC_ENABLED=false` ship with an entirely empty HRM env
 * without breaking the build or the app's normal startup path (the rollback
 * flag itself would become a risk otherwise), what lets `scripts/hrm-ping.ts`
 * call `loadEnvConfig()` from `@next/env` *after* the (hoisted) imports of
 * `@/lib/hrm/*` and still see real values, and what lets tests mutate env
 * between cases. A future "optimization" that memoizes the parsed config at
 * module scope would silently break all three.
 */
import { log } from "@/lib/logger";

export interface HrmConfig {
  /** Keycloak base URL, no trailing slash. */
  keycloakUrl: string;
  realm: string;
  clientId: string;
  /** Token path with `{realm}` already substituted. */
  tokenPath: string;
  /** HRM API base URL, no trailing slash. */
  apiUrl: string;
  username: string;
  password: string;
  pageSize: number;
  timeoutMs: number;
  /** Total attempts (>= 1) on a retryable error, from HRM_HTTP_RETRIES. */
  attempts: number;
  /**
   * How long before expiry (ms) the access token cache is treated as stale
   * and refreshed. Same knob is used for the file token in photos.ts — both
   * are "refresh a bit early" windows, not TTLs.
   */
  tokenRefreshWindowMs: number;
  /** Access token TTL assumed when neither `exp` nor `expires_in` is readable. */
  tokenFallbackTtlMs: number;
  /** File token TTL assumed when its `expirationDate`-family claim is unreadable or implausible. */
  fileTokenFallbackTtlMs: number;
  /** A parsed file-token expiry further than this from "now" is treated as implausible (see photos.ts). */
  fileTokenMaxTtlMs: number;
}

export class HrmConfigError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(`HRM config missing/invalid: ${missing.join(", ")}`);
    this.name = "HrmConfigError";
    this.missing = missing;
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Parse an integer env var, falling back (with a warning) on anything that
 * isn't a finite integer in [min, max]. A mistyped tuning knob must never be
 * able to take down the sync — only a genuinely missing required secret does.
 */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    log.warn("hrm: invalid env value, using default", { name, raw, fallback });
    return fallback;
  }
  return n;
}

/** Single source of truth for the rollback switch. Nobody else reads HRM_SYNC_ENABLED. */
export function hrmSyncEnabled(): boolean {
  return process.env.HRM_SYNC_ENABLED === "true";
}

/**
 * Non-throwing: returns a list of human-readable problems, empty when the
 * config is usable. Used by `hrm-ping` and the (future) status page.
 */
export function hrmConfigIssues(): string[] {
  try {
    hrmConfig();
    return [];
  } catch (e) {
    if (e instanceof HrmConfigError) {
      return e.missing.map((name) => `missing required env: ${name}`);
    }
    return [e instanceof Error ? e.message : String(e)];
  }
}

/**
 * Throws HrmConfigError listing ALL missing required variables. Never called
 * at module scope — always called lazily from inside a request/script.
 *
 * The rollback flag is deliberately NOT an input here: `hrmConfig()` always
 * throws when a required variable is missing, whether or not sync is
 * enabled. The flag instead gates the public entry points (runHrmSync,
 * refreshEmployeeByEmail, the photo route) — each starts with
 * `if (!hrmSyncEnabled()) return ...` before ever calling `hrmConfig()`.
 */
export function hrmConfig(): HrmConfig {
  const missing: string[] = [];

  const keycloakUrlRaw = process.env.HRM_KEYCLOAK_URL;
  if (!keycloakUrlRaw || !keycloakUrlRaw.trim()) missing.push("HRM_KEYCLOAK_URL");

  const apiUrlRaw = process.env.HRM_API_URL;
  if (!apiUrlRaw || !apiUrlRaw.trim()) missing.push("HRM_API_URL");

  const username = process.env.HRM_USERNAME;
  if (!username || !username.trim()) missing.push("HRM_USERNAME");

  // Presence is checked trimmed (a whitespace-only password is a config
  // error), but the value used is the RAW, untrimmed one: a real password
  // may legitimately end in whitespace.
  const password = process.env.HRM_PASSWORD;
  if (!password || !password.trim()) missing.push("HRM_PASSWORD");

  const realm = process.env.HRM_KEYCLOAK_REALM?.trim() || "innowise-group";
  const clientId = process.env.HRM_KEYCLOAK_CLIENT_ID?.trim() || "innowise-group";
  const tokenPathTemplate =
    process.env.HRM_KEYCLOAK_TOKEN_PATH?.trim() ||
    "/auth/realms/{realm}/protocol/openid-connect/token";

  if (missing.length > 0) {
    throw new HrmConfigError(missing);
  }

  return {
    keycloakUrl: stripTrailingSlash(keycloakUrlRaw!.trim()),
    realm,
    clientId,
    tokenPath: tokenPathTemplate.replace("{realm}", realm),
    apiUrl: stripTrailingSlash(apiUrlRaw!.trim()),
    username: username!.trim(),
    password: password!,
    pageSize: intEnv("HRM_SYNC_PAGE_SIZE", 100, 1, 1000),
    timeoutMs: intEnv("HRM_HTTP_TIMEOUT_MS", 20_000, 1_000, 120_000),
    attempts: intEnv("HRM_HTTP_RETRIES", 3, 1, 10),
    tokenRefreshWindowMs: intEnv("HRM_TOKEN_REFRESH_WINDOW_MS", 60_000, 1_000, 600_000),
    tokenFallbackTtlMs: intEnv("HRM_TOKEN_FALLBACK_TTL_MS", 60_000, 1_000, 3_600_000),
    fileTokenFallbackTtlMs: intEnv("HRM_FILE_TOKEN_FALLBACK_TTL_MS", 240_000, 1_000, 3_600_000),
    fileTokenMaxTtlMs: intEnv("HRM_FILE_TOKEN_MAX_TTL_MS", 3_600_000, 60_000, 86_400_000),
  };
}
