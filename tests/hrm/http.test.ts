import { describe, expect, it } from "vitest";
import { backoffMs } from "@/lib/hrm/retry";
import { isRetryableStatus, redactAndTruncate } from "@/lib/hrm/http";

describe("isRetryableStatus", () => {
  it.each([429, 500, 502, 503])("is retryable for %i", (status) => {
    expect(isRetryableStatus(status)).toBe(true);
  });

  it.each([400, 401, 403, 404])("is not retryable for %i", (status) => {
    expect(isRetryableStatus(status)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows with attempt number", () => {
    const a1 = backoffMs(1, { jitterMs: 0 });
    const a2 = backoffMs(2, { jitterMs: 0 });
    const a3 = backoffMs(3, { jitterMs: 0 });
    expect(a2).toBeGreaterThan(a1);
    expect(a3).toBeGreaterThan(a2);
  });

  it("is capped at maxMs", () => {
    const v = backoffMs(20, { maxMs: 5_000, jitterMs: 0 });
    expect(v).toBeLessThanOrEqual(5_000);
  });
});

describe("redactAndTruncate", () => {
  it("removes the exact token we sent", () => {
    const token = "my-secret-access-token";
    const text = `{"error":"unauthorized","context":"token was ${token}"}`;
    const out = redactAndTruncate(text, token);
    expect(out).not.toContain(token);
    expect(out).toContain("[redacted-access-token]");
  });

  it("removes an arbitrary JWT-looking substring, including a different token", () => {
    const sentToken = "sent-token-xyz";
    const otherJwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const text = `Authorization: Bearer ${otherJwt}`;
    const out = redactAndTruncate(text, sentToken);
    expect(out).not.toContain(otherJwt);
    expect(out).toContain("[redacted-jwt]");
  });

  it("redacts before truncating: a token straddling the 300-char cut leaves no fragment", () => {
    // Token starts at index 290, so a truncate-first implementation would cut
    // it mid-string and leave its first 10 characters ("TOKEN12345") visible.
    const token = "TOKEN1234567890ABCDE";
    const padding = "x".repeat(290);
    const text = `${padding}${token}`;
    const out = redactAndTruncate(text, token);
    expect(out).not.toContain("TOKEN");
    expect(out.length).toBeLessThanOrEqual(300);
  });

  it("truncates to 300 chars", () => {
    const text = "a".repeat(1000);
    expect(redactAndTruncate(text, "unused-token").length).toBe(300);
  });
});
