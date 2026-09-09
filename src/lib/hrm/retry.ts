/**
 * Generic backoff/retry primitive, used by both `auth.ts` (token grant) and
 * `http.ts` (which has its own two-budget loop and does NOT use withRetry —
 * see its file comment). Lives in `src/lib/hrm/`, not `src/lib/`: `auth.ts`
 * wants backoff on the token grant, and `http.ts` imports `auth.ts`, so a
 * shared helper in `http.ts` would be a cyclic import. It's not folded into
 * a project-wide `src/lib/retry.ts` either — see the decisions table in the
 * S01 implementation plan: `ai-service.ts`'s existing `withGeminiRetry`
 * classifies transience from a Gemini SDK error object/string, this one from
 * an HTTP `Response` status, and merging them would produce one helper with
 * two unrelated classifiers threaded through it.
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BackoffOptions {
  baseMs?: number;
  jitterMs?: number;
  maxMs?: number;
}

/** Exponential backoff with jitter, capped at maxMs. `attempt` is 1-based. */
export function backoffMs(attempt: number, o?: BackoffOptions): number {
  const baseMs = o?.baseMs ?? 300;
  const jitterMs = o?.jitterMs ?? 200;
  const maxMs = o?.maxMs ?? 5_000;
  const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.random() * jitterMs;
  return Math.min(exp + jitter, maxMs);
}

export interface RetryOptions extends BackoffOptions {
  /** Total attempts, >= 1. */
  attempts?: number;
  /** Whether a given error is worth retrying. Default: always retry. */
  isRetryable?: (e: unknown) => boolean;
}

/**
 * Retry a throwing async function. Used for the Keycloak token grant, which
 * has a single throw-based failure mode and one budget — a good fit for a
 * generic helper, unlike the HTTP request loop in http.ts.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  o?: RetryOptions
): Promise<T> {
  const attempts = o?.attempts ?? 3;
  const isRetryable = o?.isRetryable ?? (() => true);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      if (attempt >= attempts || !isRetryable(e)) throw e;
      await sleep(backoffMs(attempt, o));
    }
  }
  throw lastError;
}
