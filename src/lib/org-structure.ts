/**
 * The "Org. structure" split: one flat bag of `UserDepartment` memberships ->
 * one slot per HRM org level (Unit / Division / Department / Team / Group /
 * Person), which is how HRM itself presents a person's place in the company.
 *
 * Why this exists at all: HRM sends `employee.orgUnits[]` as an unordered list
 * mixing every level (a live sample averages ~2.6 entries per person — e.g.
 * "Global Development" (Unit), "DevOps" (Division), "Python 3" (Department)),
 * and the sync stores them as-is. Rendering that list raw is what made the
 * profile unreadable. The level is already on each unit as
 * `Department.typeName`, so the split is a pure regroup, not new data.
 *
 * Pure: no Prisma, no network — shared by the API routes, the profile page and
 * the sync's division resolution, and testable on its own.
 */
import { HRM_DIVISION_TYPE, HRM_ORG_UNIT_TYPES, type HrmOrgUnitType } from "@/lib/hrm/types";

/** The minimum a department must carry to be placed into a slot. */
export interface OrgUnitRef {
  id: string;
  name: string;
  typeName: string | null;
}

export interface OrgStructureSlot {
  type: HrmOrgUnitType;
  /**
   * Usually 0 or 1. Plural because HRM genuinely allows two units of the same
   * level (someone in two Teams), and silently dropping the second would be a
   * lie — the UI joins them instead.
   */
  units: OrgUnitRef[];
}

function byName(a: OrgUnitRef, b: OrgUnitRef): number {
  return a.name.localeCompare(b.name);
}

/**
 * Every level, always, in HRM's own root-first order — including the ones this
 * person has no unit for, which render as "-" (the screenshot shows empty
 * Team/Group/Person rows rather than a shorter card). Units of a type HRM
 * models but we don't list (e.g. the "test" type in the fixtures) are dropped.
 */
export function buildOrgStructure(units: OrgUnitRef[]): OrgStructureSlot[] {
  return HRM_ORG_UNIT_TYPES.map((type) => ({
    type,
    units: units.filter((u) => u.typeName === type).sort(byName),
  }));
}

/** Shortcut for the single slot everything is split by. */
export function pickDivision(units: OrgUnitRef[]): OrgUnitRef | null {
  return units.filter((u) => u.typeName === HRM_DIVISION_TYPE).sort(byName)[0] ?? null;
}

/** A membership as `resolveDivisionId` needs to see it: slot info plus its ancestor chain. */
export interface DepartmentWithPath extends OrgUnitRef {
  /** Root-first "/"-joined chain of ids ending with this department — see rebuildDepartmentPaths. */
  path: string;
}

/**
 * The person's Division, as written to `User.divisionId`.
 *
 * Two tiers, because HRM is not consistent about which levels land in
 * `orgUnits[]`: most people carry their Division directly, but some carry only
 * a Department/Team below it. So:
 *
 *  1. a membership that IS a Division (the normal case), else
 *  2. the nearest Division ancestor of a membership, walking each membership's
 *     `path` from the unit itself back toward the root.
 *
 * Both tiers are deterministic under ties (deepest membership first, then by
 * name), so a person with an unchanged HRM record never flip-flops between two
 * divisions across runs.
 *
 * Walking by POSITION in the path string rather than by each candidate's own
 * stored `depth` is deliberate and load-bearing: HRM's org graph has
 * cross-links, and a unit's globally computed depth can disagree with where it
 * sits in one particular descendant's chain.
 */
export function resolveDivisionId(
  memberships: DepartmentWithPath[],
  departmentsById: Map<string, OrgUnitRef>
): string | null {
  const direct = pickDivision(memberships);
  if (direct) return direct.id;

  const ordered = [...memberships].sort((a, b) => {
    const depthDiff = b.path.split("/").length - a.path.split("/").length;
    return depthDiff !== 0 ? depthDiff : byName(a, b);
  });

  for (const membership of ordered) {
    const ancestorIds = membership.path.split("/");
    for (let i = ancestorIds.length - 1; i >= 0; i--) {
      const node = departmentsById.get(ancestorIds[i]);
      if (node?.typeName === HRM_DIVISION_TYPE) return node.id;
    }
  }
  return null;
}

/**
 * Ordering used wherever the org graph has to be walked: most senior org level
 * first (Unit before Division before Department...), then by name.
 *
 * Only a tie-breaker, not structure: with `reportsToId` resolved correctly
 * (see resolveOrgUnitParents) the org graph is a clean tree, and the org level
 * does NOT track depth — the root is a `Person` unit (the CEO), which sorts
 * last here. It exists so `rebuildDepartmentPaths` has a deterministic input
 * order: were a cycle ever to appear in this external data, it breaks one at
 * whichever member comes first, and an unordered query would let `path`/`depth`
 * — and the headcount rollups, admin scope and division resolution keyed off
 * them — shift between runs over identical data.
 *
 * Both the sync and the tree the page renders sort the same way, so a node's
 * stored subtree never disagrees with where the page nests it.
 */
export function compareByOrgSeniority(
  a: { typeName: string | null; name: string },
  b: { typeName: string | null; name: string }
): number {
  const diff = orgRank(a.typeName) - orgRank(b.typeName);
  return diff !== 0 ? diff : a.name.localeCompare(b.name);
}

/** Position in HRM_ORG_UNIT_TYPES; a type we don't model ranks last, never first. */
function orgRank(typeName: string | null): number {
  const i = HRM_ORG_UNIT_TYPES.indexOf(typeName as HrmOrgUnitType);
  return i === -1 ? HRM_ORG_UNIT_TYPES.length : i;
}
