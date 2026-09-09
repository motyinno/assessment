/**
 * Org unit tree (departments etc.) from HRM.
 */
import { hrmFetch } from "@/lib/hrm/http";
import { HrmError } from "@/lib/hrm/http";
import type { HrmOrgUnit, HrmSpringPage } from "@/lib/hrm/types";

const ORG_UNITS_PATH = "/api/employee-management/api/v1/org-units";

/**
 * Full list, including empty units. Throws on a non-array shape rather than
 * returning [] — an empty array here would tell S04 the company has zero
 * departments, silently.
 */
export async function fetchOrgUnits(): Promise<HrmOrgUnit[]> {
  const body = await hrmFetch<HrmOrgUnit[] | HrmSpringPage<HrmOrgUnit>>(ORG_UNITS_PATH);

  if (Array.isArray(body)) return body;
  if (body && typeof body === "object" && Array.isArray(body.content)) {
    return body.content;
  }

  throw new HrmError({
    kind: "shape",
    status: null,
    method: "GET",
    endpoint: ORG_UNITS_PATH,
    bodySnippet: "",
    attempts: 1,
    retryable: false,
  });
}
