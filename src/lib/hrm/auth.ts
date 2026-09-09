/**
 * Keycloak password-grant token for the HRM technical user, with an in-memory
 * cache and single-flight dedup.
 *
 * The grant does its own `fetch`: different host, form-encoded body, no
 * `Authorization` header. `http.ts` imports this module — not the other way
 * around, which would cycle.
 */
import { hrmConfig } from "@/lib/hrm/config";
import { withRetry } from "@/lib/hrm/retry";
import { log } from "@/lib/logger";
import type { HrmAccessTokenClaims, HrmTokenResponse } from "@/lib/hrm/types";

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cached: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

const stats = { grants: 0, cacheHits: 0, refreshes: 0 };

/** Refresh the token if it expires within this window of "now". */
const REFRESH_WINDOW_MS = 60_000;

/**
 * Decode a JWT's payload without verifying the signature. We're a holder of
 * the token, not its validator, and only need one claim out of it. Returns
 * null on anything unparseable (including a non-object payload).
 *
 * Node's Buffer understands "base64url" natively (no manual `-`/`_` replace
 * or padding needed): `Buffer.from("eyJleHAiOjE3ODg4NDU0MjV9", "base64url")`
 * decodes correctly as-is.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * exp (seconds since epoch) -> expiry ms, with fallbacks the spec doesn't
 * mandate but that keep us from re-granting on every call when the payload
 * can't be read: exp -> expires_in -> a conservative 60s floor. Blindly
 * treating an unreadable payload as "already expired" means one password
 * grant per call — 36 grants just to page through the roster, plus one per
 * photo batch, i.e. the standard way to trip the HRM rate limit or lock out
 * the technical user.
 */
function computeExpiresAtMs(
  claims: Record<string, unknown> | null,
  tokenResponse: HrmTokenResponse,
  grantedAtMs: number
): number {
  const expClaim = claims?.exp;
  if (typeof expClaim === "number" && Number.isFinite(expClaim)) {
    return expClaim * 1000;
  }
  if (typeof tokenResponse.expires_in === "number" && Number.isFinite(tokenResponse.expires_in)) {
    log.warn("hrm: token exp claim missing, using expires_in", {});
    return grantedAtMs + tokenResponse.expires_in * 1000;
  }
  log.warn("hrm: token exp and expires_in both missing, using 60s fallback", {});
  return grantedAtMs + 60_000;
}

async function grantToken(): Promise<CachedToken> {
  const cfg = hrmConfig();
  const url = `${cfg.keycloakUrl}${cfg.tokenPath}`;
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: cfg.clientId,
    username: cfg.username,
    password: cfg.password,
  });

  return withRetry(async () => {
    // NOTE: the request body contains the technical user's password. Never
    // log `body` or the raw request — an error handler that "dumps the
    // request" for debugging would leak the credential.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    // Token response body is never logged (it carries access_token) — only status.
    if (!res.ok) {
      throw new Error(`hrm token grant failed: status ${res.status}`);
    }
    const data = (await res.json()) as HrmTokenResponse;
    if (!data.access_token) {
      throw new Error("hrm token grant: response missing access_token");
    }
    const grantedAtMs = Date.now();
    const claims = decodeJwtPayload(data.access_token) as HrmAccessTokenClaims | null;
    const expiresAtMs = computeExpiresAtMs(claims, data, grantedAtMs);
    stats.grants++;
    log.info("hrm: keycloak token issued", {
      expiresInSec: Math.round((expiresAtMs - grantedAtMs) / 1000),
      subject: claims?.sub ?? null,
      ttlSource:
        typeof claims?.exp === "number"
          ? "exp"
          : typeof data.expires_in === "number"
            ? "expires_in"
            : "fallback",
    });
    return { token: data.access_token, expiresAtMs };
  });
}

/**
 * Get a valid access token, from cache when possible. Concurrent callers
 * collapse onto one in-flight grant (single-flight): the sync itself is
 * sequential and wouldn't need this, but S12 puts this on the avatar
 * request path, where one page render fires N parallel photo requests in the
 * same Node process — without dedup that's a self-inflicted credential-stuff
 * against the technical user.
 */
export async function getHrmAccessToken(): Promise<string> {
  if (cached && cached.expiresAtMs - Date.now() > REFRESH_WINDOW_MS) {
    stats.cacheHits++;
    return cached.token;
  }
  if (inFlight) return inFlight;
  stats.refreshes++;
  inFlight = grantToken()
    .then((t) => {
      cached = t;
      return t.token;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Drop the cached token so the next call grants a fresh one. Deliberately
 * does NOT clear `inFlight` — this is the first thing a reviewer will
 * question. A grant only starts when the cache is empty or in its refresh
 * window, so any in-flight grant already started AFTER the token that just
 * got a 401 was cached — its result is strictly fresher than the rejected
 * one, and it's safe to hand to the caller that's retrying. Clearing
 * `inFlight` too would instead let two 401s on the same page race two
 * grants, each immediately superseding the other.
 */
export function resetHrmTokenCache(): void {
  cached = null;
}

/** Diagnostics only: grant/cache-hit/refresh counters. hrm-ping's "grants=1 on two calls" check relies on this. */
export function hrmTokenStats(): { grants: number; cacheHits: number; refreshes: number } {
  return { ...stats };
}

/**
 * Diagnostics only: seed the cache with a token the server will reject, so
 * the next request actually gets a 401 and exercises the reset+retry path.
 * Used by `scripts/hrm-ping.ts --simulate-401`.
 */
export function primeHrmTokenCache(token: string, expiresAtMs: number): void {
  cached = { token, expiresAtMs };
}
