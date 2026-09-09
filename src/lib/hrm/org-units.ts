/**
 * Org unit tree (departments etc.) from HRM.
 *
 * The response envelope (swagger: FieldsForUpdateWithDtoOrgUnitWithButtonsDto)
 * is NOT a bare array or a Spring `{content}` page, as originally assumed
 * before the stage run — confirmed shape is
 * `{ data: { orgUnitDtoList: [...] }, list?: [...], ... }`. A live stage
 * response carried units only under `data.orgUnitDtoList`, with no `list` key
 * present at all, but the schema also allows `list` (an array of the same
 * `{orgUnitDtoList}` shape) — so both are read and merged by id, rather than
 * assuming only one is ever populated.
 */
import { hrmFetch } from "@/lib/hrm/http";
import { HrmError } from "@/lib/hrm/http";
import type { HrmOrgUnit, HrmOrgUnitsListEnvelope } from "@/lib/hrm/types";

const ORG_UNITS_PATH = "/api/employee-management/api/v1/org-units";

function isOrgUnitsEnvelope(body: unknown): body is HrmOrgUnitsListEnvelope {
  if (!body || typeof body !== "object") return false;
  const b = body as HrmOrgUnitsListEnvelope;
  // Require at least one of the two known containers to actually be present
  // (not just absent-and-therefore-"valid") — otherwise `{}` or an unrelated
  // object would silently normalize to zero org units.
  const hasData = b.data !== undefined && b.data !== null && typeof b.data === "object";
  const hasList = Array.isArray(b.list);
  if (!hasData && !hasList) return false;
  return (
    (b.data === undefined || b.data === null || typeof b.data === "object") &&
    (b.list === undefined || b.list === null || Array.isArray(b.list))
  );
}

/**
 * Full list, including empty units. Throws on a shape we don't recognize
 * rather than returning [] — an empty array here would tell S04 the company
 * has zero departments, silently.
 */
export async function fetchOrgUnits(): Promise<HrmOrgUnit[]> {
  const body = await hrmFetch<unknown>(ORG_UNITS_PATH);

  if (!isOrgUnitsEnvelope(body)) {
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

  const byId = new Map<string, HrmOrgUnit>();
  const collect = (units: HrmOrgUnit[] | null | undefined) => {
    for (const unit of units ?? []) {
      const key = unit.id !== null && unit.id !== undefined ? String(unit.id) : `__no_id_${byId.size}`;
      byId.set(key, unit);
    }
  };
  collect(body.data?.orgUnitDtoList);
  for (const group of body.list ?? []) collect(group.orgUnitDtoList);

  return [...byId.values()];
}
