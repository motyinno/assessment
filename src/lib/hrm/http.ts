/**
 * HRM API transport: auth, retries, timeout, and error redaction in one
 * place. This is the only file in `src/lib/hrm/` that talks to the HRM API
 * itself (auth.ts talks to Keycloak).
 *
 * Two independent retry budgets. Counters are monotonic and never mixed; the
 * loop terminates because every iteration either increments `attemptsMade`
 * or flips `authRetryUsed` from false to true, and both are bounded.
 *
 * `HRM_HTTP_RETRIES=3` means 3 attempts TOTAL (1 first try + 2 retries), not
 * 4 requests — matching the one precedent in this codebase,
 * `withGeminiRetry(fn, attempts = 3)`, which also counts the first try.
 * Otherwise the same number "3" would mean two different things in the same
 * codebase.
 *
 * A fresh `AbortSignal.timeout(...)` is created on every attempt. A signal
 * raised once outside the loop is already aborted by the second attempt, so
 * every retry would fail in microseconds and the client would look like a
 * permanently-down HRM.
 *
 * `Retry-After` is honored on 429 (capped at 30s) — the HRM gateway knows its
 * own throttling window better than we do.
 *
 * Retrying the POST is safe HERE ONLY: `employees/v2/search` is a POST that
 * reads, and the token grant is idempotent in effect. Nothing in S01 sends a
 * mutating POST. This rule does not generalize — if a future change adds a
 * writing POST through this client, it must NOT go through the blanket retry
 * here.
 *
 * 403 gets exactly one retry with a token reset (gateways do map an expired
 * token to 403 as well as 401) and is then final — it never counts against
 * the *transient* retry budget. This looks like it contradicts
 * 06-ARCHITECTURE.md §6.2 ("400/403/404 are not retried"); it doesn't — that
 * note is about the transient-error budget, and the one 401/403 auth retry
 * is a separate, single-shot mechanism.
 */
import { getHrmAccessToken, resetHrmTokenCache } from "@/lib/hrm/auth";
import { hrmConfig } from "@/lib/hrm/config";
import { backoffMs, sleep } from "@/lib/hrm/retry";
import { log } from "@/lib/logger";

export type HrmErrorKind = "network" | "timeout" | "http" | "shape";

export interface HrmErrorInit {
  kind: HrmErrorKind;
  status: number | null;
  method: string;
  endpoint: string;
  bodySnippet: string;
  attempts: number;
  retryable: boolean;
  cause?: unknown;
}

export class HrmError extends Error {
  readonly kind: HrmErrorKind;
  readonly status: number | null;
  readonly method: string;
  readonly endpoint: string;
  readonly bodySnippet: string;
  readonly attempts: number;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(init: HrmErrorInit) {
    super(`hrm ${init.method} ${init.endpoint} failed: ${init.kind}${init.status ? ` (${init.status})` : ""}`);
    this.name = "HrmError";
    this.kind = init.kind;
    this.status = init.status;
    this.method = init.method;
    this.endpoint = init.endpoint;
    this.bodySnippet = init.bodySnippet;
    this.attempts = init.attempts;
    this.retryable = init.retryable;
    this.cause = init.cause;
  }
}

export function isHrmError(e: unknown): e is HrmError {
  return e instanceof HrmError;
}

export interface HrmRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Whitelisted safe fields for logs (e.g. page, size, sort, dismissalStatus) — never a raw query dump. */
  logMeta?: Record<string, unknown>;
  /** Overrides `hrmConfig().timeoutMs` for this call only — used by the login-time refresh path (see hrmConfig().loginTimeoutMs). */
  timeoutMs?: number;
}

export interface HrmResponseEnvelope<T> {
  data: T;
  status: number;
  headers: Headers;
}

const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

/**
 * Redact THEN truncate — truncation alone bounds the leak's size, not its
 * content. If the gateway echoes `Authorization` in an error body (the
 * default Spring error JSON, and some API gateways, do this), the first 300
 * characters are exactly where the token lives. Pure; exported for tests.
 */
export function redactAndTruncate(text: string, token: string): string {
  return text
    .split(token)
    .join("[redacted-access-token]") // the exact token we sent
    .replace(JWT_RE, "[redacted-jwt]") // any other JWT, including a fileToken
    .replace(/\s+/g, " ")
    .slice(0, 300); // redact FIRST, truncate SECOND
}

async function safeSnippet(res: Response, token: string): Promise<string> {
  let text: string;
  try {
    text = await res.text();
  } catch {
    return "";
  }
  return redactAndTruncate(text, token);
}

/** Pure: is this HTTP status worth retrying? Exported for tests. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function buildUrl(apiUrl: string, path: string, query?: HrmRequestOptions["query"]): { url: string; pathname: string } {
  const url = new URL(path.startsWith("http") ? path : `${apiUrl}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return { url: url.toString(), pathname: url.pathname };
}

async function parseJsonOrThrow<T>(
  res: Response,
  method: string,
  endpoint: string,
  attempts: number
): Promise<{ data: T; status: number; headers: Headers }> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    throw new HrmError({
      kind: "shape",
      status: res.status,
      method,
      endpoint,
      bodySnippet: "",
      attempts,
      retryable: false,
    });
  }
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch (e) {
    throw new HrmError({
      kind: "shape",
      status: res.status,
      method,
      endpoint,
      bodySnippet: "",
      attempts,
      retryable: false,
      cause: e,
    });
  }
  return { data, status: res.status, headers: res.headers };
}

/**
 * Full request/response envelope. `employees.ts` needs this because HRM may
 * report the page count in a header rather than the body.
 */
export async function hrmRequest<T>(
  path: string,
  o?: HrmRequestOptions
): Promise<HrmResponseEnvelope<T>> {
  const cfg = hrmConfig();
  const method = o?.method ?? "GET";
  const timeoutMs = o?.timeoutMs ?? cfg.timeoutMs;
  const { url, pathname } = buildUrl(cfg.apiUrl, path, o?.query);

  let attemptsMade = 0;
  let authRetryUsed = false;

  for (;;) {
    const token = await getHrmAccessToken();
    attemptsMade++;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (o?.body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: o?.body !== undefined ? JSON.stringify(o.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const isTimeout = e instanceof Error && e.name === "TimeoutError";
      if (attemptsMade < cfg.attempts) {
        log.warn("hrm: request failed, retrying", {
          method,
          endpoint: pathname,
          attempt: attemptsMade,
          kind: isTimeout ? "timeout" : "network",
          ...(o?.logMeta ?? {}),
        });
        await sleep(backoffMs(attemptsMade));
        continue;
      }
      throw new HrmError({
        kind: isTimeout ? "timeout" : "network",
        status: null,
        method,
        endpoint: pathname,
        bodySnippet: "",
        attempts: attemptsMade,
        retryable: true,
        cause: e,
      });
    }

    if ((res.status === 401 || res.status === 403) && !authRetryUsed) {
      authRetryUsed = true;
      attemptsMade--; // this attempt said nothing about transience
      resetHrmTokenCache();
      log.warn("hrm: auth rejected, retrying once", { method, endpoint: pathname, status: res.status });
      continue;
    }

    if (res.ok) {
      return parseJsonOrThrow<T>(res, method, pathname, attemptsMade);
    }

    if (isRetryableStatus(res.status)) {
      if (attemptsMade < cfg.attempts) {
        const waitMs = Math.min(retryAfterMs(res) ?? backoffMs(attemptsMade), 30_000);
        log.warn("hrm: retryable http error, retrying", {
          method,
          endpoint: pathname,
          attempt: attemptsMade,
          status: res.status,
          ...(o?.logMeta ?? {}),
        });
        await sleep(waitMs);
        continue;
      }
    }

    throw new HrmError({
      kind: "http",
      status: res.status,
      method,
      endpoint: pathname,
      bodySnippet: await safeSnippet(res, token),
      attempts: attemptsMade,
      retryable: isRetryableStatus(res.status),
    });
  }
}

/** Thin wrapper over hrmRequest that discards status/headers. */
export async function hrmFetch<T>(path: string, o?: HrmRequestOptions): Promise<T> {
  const { data } = await hrmRequest<T>(path, o);
  return data;
}
