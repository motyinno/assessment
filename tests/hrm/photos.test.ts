import { describe, expect, it } from "vitest";
import { buildPhotoUrl, isExpiryPlausible, parseExpirationDate } from "@/lib/hrm/photos";

describe("parseExpirationDate", () => {
  it("parses epoch seconds", () => {
    // 2026-01-01T00:00:00Z
    const seconds = 1767225600;
    expect(parseExpirationDate(seconds)).toBe(seconds * 1000);
  });

  it("parses epoch milliseconds", () => {
    const ms = 1767225600000;
    expect(parseExpirationDate(ms)).toBe(ms);
  });

  it("parses a digit string recursively", () => {
    expect(parseExpirationDate("1767225600")).toBe(1767225600 * 1000);
  });

  it("parses ISO strings", () => {
    expect(parseExpirationDate("2026-01-01T00:00:00Z")).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("parses ISO strings with a space instead of T", () => {
    expect(parseExpirationDate("2026-01-01 00:00:00")).toBe(Date.parse("2026-01-01T00:00:00Z"));
  });

  it("returns null on garbage", () => {
    expect(parseExpirationDate("not-a-date")).toBeNull();
    expect(parseExpirationDate(null)).toBeNull();
    expect(parseExpirationDate(undefined)).toBeNull();
    expect(parseExpirationDate({})).toBeNull();
    expect(parseExpirationDate("")).toBeNull();
  });
});

describe("isExpiryPlausible (far-future sanitization)", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");

  it("accepts a value a few minutes out", () => {
    expect(isExpiryPlausible(now + 5 * 60_000, now)).toBe(true);
  });

  it("rejects a value already in the past", () => {
    expect(isExpiryPlausible(now - 1_000, now)).toBe(false);
  });

  it("rejects a value implausibly far in the future — a bad far-future value must not pin a dead token forever", () => {
    expect(isExpiryPlausible(now + 100 * 365 * 24 * 3600_000, now)).toBe(false);
  });

  it("rejects null (unparseable)", () => {
    expect(isExpiryPlausible(null, now)).toBe(false);
  });
});

describe("buildPhotoUrl", () => {
  it("encodes a slash in the filename", () => {
    const url = buildPhotoUrl("photos/employee-1.jpg", "tok123");
    expect(url).toContain("fileName=photos%2Femployee-1.jpg");
    expect(url).toContain("fileToken=tok123");
  });
});
