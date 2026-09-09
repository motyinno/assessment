/**
 * `employees/v2/search` paging.
 *
 * `sort=id,asc` is load-bearing, not a stylistic default: sorting by
 * modification date would let a record edited mid-crawl move onto an
 * already-visited page and silently drop out; `id` never changes, and new
 * records always land at the end.
 *
 * What's known vs. not (HRM-Integration-nodeassm.md §1.1/§4): `page`/`size`/
 * `sort` are query params, `page` is 0-based, `sort=id,asc` is required.
 * NOT documented anywhere: whether the response is a bare array or a Spring
 * `Page` envelope, or where the total lives — §1.1 only shows the *element*
 * schema. `GET /org-units` taking `filter`/`range`/`sort` hints at a
 * react-admin-style convention (paired with `Content-Range`/`X-Total-Count`)
 * but that's evidence about a different endpoint, not a fact about this one.
 *
 * So `totalPages` is INFERRED, and paging never blocks on a specific shape —
 * see `normalizeEmployeePage` below.
 */
import { hrmRequest } from "@/lib/hrm/http";
import { HrmError } from "@/lib/hrm/http";
import { hrmConfig } from "@/lib/hrm/config";
import type { HrmEmployee, HrmSpringPage } from "@/lib/hrm/types";

const SEARCH_PATH = "/api/employee-management/api/v2/employees/search";

export interface SearchEmployeesArgs {
  /** 0-based (HRM doc §4: "page 0..N"). Default 0. */
  page?: number;
  /** Default hrmConfig().pageSize. */
  size?: number;
  /** "ACTUAL" | "DELETED"; unset -> body {}. */
  dismissalStatus?: string;
  /** For point refresh (S03). */
  email?: string;
  /** Default "id,asc" — do not change without a strong reason, see file comment. */
  sort?: string;
  /** Overrides hrmConfig().timeoutMs for this call — refresh-user.ts passes hrmConfig().loginTimeoutMs. */
  timeoutMs?: number;
}

export type EmployeePageTotalSource = "body" | "x-total-count" | "content-range" | "inferred";

export interface EmployeePage {
  items: HrmEmployee[];
  /** May be a LOWER BOUND if HRM doesn't report a total. */
  totalPages: number;
  totalElements: number | null;
  /** Authoritative loop condition. */
  hasMore: boolean;
  totalSource: EmployeePageTotalSource;
}

function parseContentRangeTotal(headerValue: string | null): number | null {
  if (!headerValue) return null;
  // e.g. "items 0-99/3600"
  const slash = headerValue.lastIndexOf("/");
  if (slash === -1) return null;
  const total = Number(headerValue.slice(slash + 1));
  return Number.isFinite(total) ? total : null;
}

/** Pure: the two possible body shapes + headers. Exported for tests. */
export function normalizeEmployeePage(
  body: unknown,
  headers: Headers,
  requestedPage: number,
  requestedSize: number
): EmployeePage {
  let items: HrmEmployee[] | null = null;
  let totalPages: number | null = null;
  let totalElements: number | null = null;
  let totalSource: EmployeePageTotalSource = "inferred";
  let effectiveSize = requestedSize;

  if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as HrmSpringPage<HrmEmployee>).content)) {
    const spring = body as HrmSpringPage<HrmEmployee>;
    items = spring.content ?? [];
    totalPages = typeof spring.totalPages === "number" ? spring.totalPages : null;
    totalElements = typeof spring.totalElements === "number" ? spring.totalElements : null;
    effectiveSize = typeof spring.size === "number" ? spring.size : requestedSize;
    totalSource = "body";
  } else if (Array.isArray(body)) {
    items = body as HrmEmployee[];
    const xTotalCount = headers.get("x-total-count");
    if (xTotalCount !== null && Number.isFinite(Number(xTotalCount))) {
      totalElements = Number(xTotalCount);
      totalSource = "x-total-count";
    } else {
      const contentRangeTotal = parseContentRangeTotal(headers.get("content-range"));
      if (contentRangeTotal !== null) {
        totalElements = contentRangeTotal;
        totalSource = "content-range";
      } else {
        const xTotalPages = headers.get("x-total-pages");
        if (xTotalPages !== null && Number.isFinite(Number(xTotalPages))) {
          totalPages = Number(xTotalPages);
          totalSource = "x-total-count"; // still an authoritative header source
        }
      }
    }
    if (totalElements !== null && totalPages === null) {
      totalPages = Math.ceil(totalElements / effectiveSize);
    }
  } else {
    throw new HrmError({
      kind: "shape",
      status: null,
      method: "POST",
      endpoint: SEARCH_PATH,
      bodySnippet: "",
      attempts: 1,
      retryable: false,
    });
  }

  const hasMore =
    items.length > 0 &&
    (totalElements !== null
      ? (requestedPage + 1) * effectiveSize < totalElements
      : items.length >= effectiveSize);

  if (totalPages === null) {
    // Never returns []: a soft-failed client returning an empty employee list
    // is the documented way to archive an entire company (06-ARCHITECTURE.md §6.1).
    totalPages = requestedPage + (hasMore ? 2 : 1);
  }

  return { items, totalPages, totalElements, hasMore, totalSource };
}

export async function searchEmployees(args?: SearchEmployeesArgs): Promise<EmployeePage> {
  const cfg = hrmConfig();
  const page = args?.page ?? 0;
  const size = args?.size ?? cfg.pageSize;
  const sort = args?.sort ?? "id,asc";

  const body: Record<string, unknown> = {};
  if (args?.dismissalStatus) body.dismissalStatus = { equals: args.dismissalStatus };
  if (args?.email) body.email = { equals: args.email };

  const { data, headers } = await hrmRequest<unknown>(SEARCH_PATH, {
    method: "POST",
    body,
    query: { page, size, sort },
    logMeta: { page, size, sort, dismissalStatus: args?.dismissalStatus },
    timeoutMs: args?.timeoutMs,
  });

  return normalizeEmployeePage(data, headers, page, size);
}
