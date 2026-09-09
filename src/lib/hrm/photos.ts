/**
 * `fileToken` for photo pre-signed links, cached by its own TTL (a different
 * mechanism from the access token in auth.ts — see below).
 *
 * TTL comes from the `expirationDate` claim inside the fileToken's own JWT —
 * a different field name than `exp` on the access token, and the encoding
 * isn't documented (HRM doc §2 only says "~5 min, cache by it"). So all three
 * forms seen in the wild are parsed: a number < 1e12 is seconds, >= 1e12 is
 * milliseconds (1e12 ms is year 2001, 1e12 s is year 33658); a digit string
 * recurses as a number; anything else goes through Date.parse (ISO, plus the
 * space-instead-of-"T" variant, treated as UTC). Claim search order:
 * expirationDate -> exp -> expiresAt.
 *
 * The parsed result is range-sanitized: a nonsense value far in the future is
 * worse than an unparseable one — it pins a dead token in the cache forever,
 * and every avatar on every page then 401s until the process restarts.
 */
import { hrmFetch } from "@/lib/hrm/http";
import { log } from "@/lib/logger";
import type { HrmFileTokenResponse } from "@/lib/hrm/types";

const FILE_TOKEN_PATH = "/api/employee-management/api/v1/files/token";
const PHOTO_BASE_URL_PATH = "/api/employee-management/api/v1/files/pre-signed-link";

/** 4 min, deliberately shorter than the documented ~5 min. */
const FILE_TOKEN_FALLBACK_TTL_MS = 240_000;
/** Anything longer than this for this token is implausible. */
const FILE_TOKEN_MAX_TTL_MS = 3_600_000;
const REFRESH_WINDOW_MS = 60_000;

interface CachedFileToken {
  token: string;
  expiresAtMs: number;
}

let cached: CachedFileToken | null = null;
let inFlight: Promise<string> | null = null;

const stats = { fetches: 0, cacheHits: 0, fallbackTtlUsed: 0 };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf-8");
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function numberToMs(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  return n < 1e12 ? n * 1000 : n;
}

/** Never throws — a photo request must degrade to initials (S12), not to a 500. Returns epoch ms or null. */
export function parseExpirationDate(value: unknown): number | null {
  if (typeof value === "number") return numberToMs(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (/^\d+$/.test(trimmed)) return parseExpirationDate(Number(trimmed));
    const isoLike = trimmed.includes(" ") && !trimmed.includes("T") ? trimmed.replace(" ", "T") : trimmed;
    const parsed = Date.parse(isoLike.endsWith("Z") || /[+-]\d\d:\d\d$/.test(isoLike) ? isoLike : `${isoLike}Z`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractExpiryClaim(claims: Record<string, unknown> | null): unknown {
  if (!claims) return null;
  if ("expirationDate" in claims) return claims.expirationDate;
  if ("exp" in claims) return claims.exp;
  if ("expiresAt" in claims) return claims.expiresAt;
  return null;
}

/**
 * Pure: is a parsed expiry timestamp usable? A nonsense value far in the
 * future is worse than an unparseable one — it pins a dead token in the
 * cache forever. Exported for tests.
 */
export function isExpiryPlausible(parsedMs: number | null, nowMs: number): boolean {
  if (parsedMs === null) return false;
  if (parsedMs <= nowMs) return false;
  if (parsedMs - nowMs > FILE_TOKEN_MAX_TTL_MS) return false;
  return true;
}

function resolveExpiresAtMs(token: string): { expiresAtMs: number; usedFallback: boolean } {
  const claims = decodeJwtPayload(token);
  const raw = extractExpiryClaim(claims);
  const parsed = parseExpirationDate(raw);
  const now = Date.now();

  if (!isExpiryPlausible(parsed, now)) {
    log.warn("hrm: file token expiry unparseable or out of range, using fallback TTL", {
      claimNames: claims ? Object.keys(claims) : [],
    });
    stats.fallbackTtlUsed++;
    return { expiresAtMs: now + FILE_TOKEN_FALLBACK_TTL_MS, usedFallback: true };
  }
  return { expiresAtMs: parsed as number, usedFallback: false };
}

async function fetchFileToken(): Promise<CachedFileToken> {
  const body = await hrmFetch<HrmFileTokenResponse>(FILE_TOKEN_PATH, { method: "GET" });
  const token = body.fileToken ?? body.token;
  if (!token) {
    throw new Error("hrm: file token response missing fileToken");
  }
  stats.fetches++;
  const { expiresAtMs } = resolveExpiresAtMs(token);
  return { token, expiresAtMs };
}

/**
 * Same single-flight collapse as auth.ts, and more important here: N
 * concurrent avatar requests on one render is the STANDARD case, and the doc
 * insists on taking one fileToken per batch, not per employee.
 */
export async function getFileToken(): Promise<string> {
  if (cached && cached.expiresAtMs - Date.now() > REFRESH_WINDOW_MS) {
    stats.cacheHits++;
    return cached.token;
  }
  if (inFlight) return inFlight;
  inFlight = fetchFileToken()
    .then((t) => {
      cached = t;
      return t.token;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function resetFileTokenCache(): void {
  cached = null;
}

/**
 * Pure URL assembly (path + query only — no hrmConfig() call, so it's
 * testable without env setup). The backend never requests this URL — the
 * browser does (HRM doc §1.1 item 6), so a caller that needs an absolute
 * link (S12's photo route, hrm-ping's --show-token) prepends
 * `hrmConfig().apiUrl` itself. URLSearchParams encodes a slash in a filename
 * as %2F, which is legal and Spring's @RequestParam decodes it — but verify
 * against a live link (hrm-ping --show-token): if it doesn't 302, switch to
 * manual encoding that preserves the slash.
 */
export function buildPhotoUrl(fileName: string, fileToken: string): string {
  const params = new URLSearchParams({ fileName, fileToken });
  return `${PHOTO_BASE_URL_PATH}?${params.toString()}`;
}

export function fileTokenStats(): { fetches: number; cacheHits: number; fallbackTtlUsed: number } {
  return { ...stats };
}
