import { describe, expect, it } from "vitest";
import { normalizeEmployeePage } from "@/lib/hrm/employees";
import { isHrmError } from "@/lib/hrm/http";
import type { HrmEmployee } from "@/lib/hrm/types";

function employees(n: number): HrmEmployee[] {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), email: `u${i}@x.com` }));
}

describe("normalizeEmployeePage", () => {
  it("reads a Spring Page envelope", () => {
    const body = {
      content: employees(10),
      totalPages: 5,
      totalElements: 50,
      size: 10,
      number: 0,
    };
    const result = normalizeEmployeePage(body, new Headers(), 0, 10);
    expect(result.items).toHaveLength(10);
    expect(result.totalPages).toBe(5);
    expect(result.totalElements).toBe(50);
    expect(result.totalSource).toBe("body");
    expect(result.hasMore).toBe(true);
  });

  it("reads a bare array with X-Total-Count", () => {
    const headers = new Headers({ "X-Total-Count": "25" });
    const result = normalizeEmployeePage(employees(10), headers, 0, 10);
    expect(result.totalSource).toBe("x-total-count");
    expect(result.totalElements).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  it("reads a bare array with Content-Range", () => {
    const headers = new Headers({ "Content-Range": "items 0-9/33" });
    const result = normalizeEmployeePage(employees(10), headers, 0, 10);
    expect(result.totalSource).toBe("content-range");
    expect(result.totalElements).toBe(33);
    expect(result.totalPages).toBe(4);
  });

  it("infers a lower bound when an array arrives with no headers", () => {
    const result = normalizeEmployeePage(employees(10), new Headers(), 0, 10);
    expect(result.totalSource).toBe("inferred");
    expect(result.totalElements).toBeNull();
    expect(result.hasMore).toBe(true);
    // Lower bound: at least one more page than what's been seen.
    expect(result.totalPages).toBe(2);
  });

  it("stops (hasMore=false) once a page comes back short with no headers", () => {
    const result = normalizeEmployeePage(employees(3), new Headers(), 2, 10);
    expect(result.hasMore).toBe(false);
    expect(result.totalPages).toBe(3);
  });

  it("throws HrmError on an unrecognizable body shape", () => {
    let caught: unknown;
    try {
      normalizeEmployeePage({ nonsense: true }, new Headers(), 0, 10);
    } catch (e) {
      caught = e;
    }
    expect(isHrmError(caught)).toBe(true);
  });

  it("never returns [] on garbage — it throws instead", () => {
    expect(() => normalizeEmployeePage(null, new Headers(), 0, 10)).toThrow();
    expect(() => normalizeEmployeePage("oops", new Headers(), 0, 10)).toThrow();
  });

  it("hasMore compares against the effective (server-capped) page size, not the requested one", () => {
    // We asked for size=100 but the server capped the page at 50.
    const body = { content: employees(50), totalPages: null, totalElements: null, size: 50 };
    const result = normalizeEmployeePage(body, new Headers(), 0, 100);
    // Naive check against requestedSize (100) would wrongly read hasMore=false
    // here and stop the crawl after the first (capped) page.
    expect(result.hasMore).toBe(true);
  });
});
