/**
 * Extract a human-readable message from an API error response body.
 *
 * The API wraps errors as `{ error: { code, message, details? } }` (see
 * lib/api-helpers `errorJson`). Reading `body.error` directly yields the nested
 * OBJECT, which stringifies to "[object Object]" in the UI — this normalizes it
 * back to the `message` string, with a couple of defensive fallbacks.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    // Defensive: some older callers/endpoints returned a bare string.
    if (typeof err === "string" && err.trim()) return err;
    if (err && typeof err === "object" && "message" in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg;
    }
  }
  return fallback;
}
