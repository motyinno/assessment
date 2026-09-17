import prisma from "@/lib/prisma";
import { rebuildDepartmentPaths } from "@/lib/hrm/tree";
import { compareByOrgSeniority } from "@/lib/org-structure";

/**
 * Non-staff shape for department members / head / deputy (S10). Deliberately
 * the *only* select used for people inside a department response — unlike
 * `/api/users`, which conditionally widens to STAFF_USER_SELECT by role,
 * `/api/departments*` gives every role the same shape. Grade, project(s) and
 * manager must never leak here (S10 spec, "What a regular user can see").
 */
export const DEPARTMENT_MEMBER_SLIM = {
  id: true,
  name: true,
  email: true,
  jobTitle: true,
  photoFileName: true,
} as const;

export const DEPARTMENT_SELECT = {
  id: true,
  hrmId: true,
  name: true,
  typeName: true,
  isFilterable: true,
  isSinglePerson: true,
  parentId: true,
  depth: true,
  path: true,
  // Not part of the client-facing item shape directly — resolved into
  // `head`/`deputy` refs below and dropped from the response.
  headUserId: true,
  deputyUserId: true,
} as const;

export type DepartmentRow = {
  id: string;
  hrmId: number;
  name: string;
  typeName: string | null;
  isFilterable: boolean;
  isSinglePerson: boolean;
  parentId: string | null;
  depth: number;
  path: string;
  headUserId: string | null;
  deputyUserId: string | null;
};

/**
 * Active memberships per department as SETS of user ids, "in unit" only.
 * Sets rather than counts because every subtree roll-up below has to
 * deduplicate people — see `rollUpDistinct`.
 */
export async function getMembersByDepartment(
  includeArchived: boolean
): Promise<Map<string, Set<string>>> {
  const rows = await prisma.userDepartment.findMany({
    where: includeArchived ? {} : { user: { isArchived: false } },
    select: { userId: true, departmentId: true },
  });
  const byDept = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byDept.get(r.departmentId) ?? new Set<string>();
    set.add(r.userId);
    byDept.set(r.departmentId, set);
  }
  return byDept;
}

/**
 * Rolls per-department sets of entity ids (users, assessments, …) up each
 * subtree and returns the DISTINCT count per department, using the `path`
 * convention from `rebuildDepartmentPaths` (src/lib/hrm/tree.ts): a node's
 * `path` is the root-first chain of ids ending with itself, so adding each
 * entity to every segment of its department's path fills in that department
 * and all of its ancestors in one pass.
 *
 * Distinct, not summed. HRM puts one person in ~2.6 units, so the same person
 * routinely appears in a unit AND in one of its own sub-units — summing
 * per-node counts then counts them once per unit. Live example, the shape this
 * function exists to fix: "PHP, GO" showed 13 in unit and 168 including
 * sub-units over children of 62 and 93, i.e. 13 + 62 + 93 — but those 13
 * people are all also in PHP or GO, so the subtree really holds 155 people,
 * not 168.
 *
 * O(entities × depth), not O(depts²).
 */
export function rollUpDistinct<T extends { id: string; path: string }>(
  nodes: T[],
  directSets: Map<string, Set<string>>
): Map<string, number> {
  const accumulated = new Map<string, Set<string>>();
  for (const node of nodes) {
    const own = directSets.get(node.id);
    if (!own || own.size === 0) continue;
    for (const ancestorId of node.path.split("/")) {
      const set = accumulated.get(ancestorId) ?? new Set<string>();
      for (const entityId of own) set.add(entityId);
      accumulated.set(ancestorId, set);
    }
  }

  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.id, accumulated.get(node.id)?.size ?? 0);
  return counts;
}

export interface DepartmentHeadRef {
  id: string;
  name: string;
  jobTitle: string | null;
  photoFileName: string | null;
}

/**
 * Batch-resolves `headUserId`/`deputyUserId` into `{id, name, jobTitle,
 * photoFileName}` for a set of departments — one `findMany`, not one query
 * per unit. A dangling id (HEAD_UNRESOLVED, S04) simply isn't in the map, so
 * callers fall back to `null` instead of throwing.
 */
export async function getHeadRefs(
  userIds: Array<string | null>
): Promise<Map<string, DepartmentHeadRef>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, jobTitle: true, photoFileName: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

export interface DepartmentItem {
  id: string;
  hrmId: number;
  name: string;
  typeName: string | null;
  isFilterable: boolean;
  isSinglePerson: boolean;
  parentId: string | null;
  depth: number;
  path: string;
  /**
   * Direct memberships of this exact unit. No longer rendered anywhere — it
   * measures how far HRM propagated membership up the tree, not the org (see
   * department-tree.tsx) — but kept on the response: it's a well-defined datum
   * and /api/departments is a published shape.
   */
  memberCount: number;
  /** Distinct people in this unit and everything under it. The headcount the UI shows. */
  memberCountWithDescendants: number;
  head: DepartmentHeadRef | null;
}

export interface DepartmentData {
  all: DepartmentRow[];
  /** User ids per department, "in unit" only — the input every subtree roll-up needs. */
  membersByDepartment: Map<string, Set<string>>;
  memberCount: Map<string, number>;
  /** DISTINCT people in the department's whole subtree — see rollUpDistinct. */
  withDescendants: Map<string, number>;
  headRefs: Map<string, DepartmentHeadRef>;
}

/**
 * Every active department plus the counts/head lookups both `/api/departments`
 * and `/api/departments/[id]` need — one shared load so neither route
 * reinvents "one groupBy + one path-prefix sum + one head findMany" and both
 * stay consistent with each other's numbers.
 */
export async function loadDepartmentData(includeArchived: boolean): Promise<DepartmentData> {
  const all = await prisma.department.findMany({
    where: { isActive: true },
    select: DEPARTMENT_SELECT,
    orderBy: { name: "asc" },
  });
  const membersByDept = await getMembersByDepartment(includeArchived);
  const memberCount = new Map([...membersByDept].map(([id, set]) => [id, set.size]));
  const withDescendants = rollUpDistinct(all, membersByDept);
  const headRefs = await getHeadRefs(all.flatMap((d) => [d.headUserId, d.deputyUserId]));
  return { all, membersByDepartment: membersByDept, memberCount, withDescendants, headRefs };
}

export function toDepartmentItem(d: DepartmentRow, data: DepartmentData): DepartmentItem {
  return {
    id: d.id,
    hrmId: d.hrmId,
    name: d.name,
    typeName: d.typeName,
    isFilterable: d.isFilterable,
    isSinglePerson: d.isSinglePerson,
    parentId: d.parentId,
    depth: d.depth,
    path: d.path,
    memberCount: data.memberCount.get(d.id) ?? 0,
    memberCountWithDescendants: data.withDescendants.get(d.id) ?? 0,
    head: d.headUserId ? data.headRefs.get(d.headUserId) ?? null : null,
  };
}

/**
 * F2 "Display rules": drop units with 0 active memberships anywhere in
 * their own subtree (noise), and optionally units not usable as a filter
 * (`isSinglePerson` positions). Safe to prune wholesale — if a node's
 * memberCountWithDescendants is 0 every descendant's is too (a subtree's
 * distinct set only grows going down), so nothing downstream gets orphaned by
 * removing it.
 */
export function pruneEmpty(
  all: DepartmentRow[],
  data: DepartmentData,
  filterableOnly: boolean
): DepartmentRow[] {
  let survivors = all.filter((d) => (data.withDescendants.get(d.id) ?? 0) > 0);
  if (filterableOnly) survivors = survivors.filter((d) => d.isFilterable);
  return survivors;
}

export interface DepartmentTreeItem extends DepartmentItem {
  children: DepartmentTreeItem[];
}

/**
 * Nests `survivors` into root-level items with recursive `children`.
 *
 * Must not assume the parent chain terminates: HRM's `reportsToId` graph
 * genuinely contains cycles. A live pull had 502 of 504 units inside one —
 * Global Development -> Java VOKA -> Development Team VOKA -> VOKA.IO -> VOKA
 * -> ERP Solutions -> Business Practice -> DMO -> back to Java VOKA — which
 * left this function with ZERO roots (every node had a surviving parent) and
 * rendered the whole Departments page blank.
 *
 * So the parent used for nesting is the EFFECTIVE one from
 * `rebuildDepartmentPaths` — the same cycle-breaking walk that computes
 * `path`/`depth` during the sync (one implementation, already tested for
 * cycles) — rather than the raw `parentId`. It promotes one member of each
 * cycle to a root and hangs the rest below it, dropping exactly one edge. That
 * matters here: nesting by raw `parentId` while taking roots from the
 * cycle-broken walk would list the promoted node twice and recurse forever.
 */
export function buildDepartmentTree(
  survivors: DepartmentRow[],
  data: DepartmentData
): DepartmentTreeItem[] {
  const survivorIds = new Set(survivors.map((d) => d.id));
  const paths = rebuildDepartmentPaths(
    [...survivors].sort(compareByOrgSeniority).map((d) => ({
      id: d.id,
      // A parent that didn't survive the prune counts as absent, so its
      // orphaned children surface as roots instead of vanishing.
      parentId: d.parentId !== null && survivorIds.has(d.parentId) ? d.parentId : null,
    }))
  );

  const childrenOf = new Map<string, DepartmentRow[]>();
  const roots: DepartmentRow[] = [];
  for (const d of survivors) {
    // `path` is a root-first "/"-joined id chain ending with the node itself,
    // so the effective parent is the segment before last.
    const segments = paths.get(d.id)?.path.split("/") ?? [d.id];
    const parentId = segments.length > 1 ? segments[segments.length - 2] : null;
    if (parentId) {
      const list = childrenOf.get(parentId) ?? [];
      list.push(d);
      childrenOf.set(parentId, list);
    } else {
      roots.push(d);
    }
  }

  function build(node: DepartmentRow): DepartmentTreeItem {
    const kids = childrenOf.get(node.id) ?? [];
    return { ...toDepartmentItem(node, data), children: kids.map(build) };
  }

  return roots.map(build);
}

export interface DepartmentBreadcrumb {
  id: string;
  name: string;
}

export interface DepartmentMemberRef {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  photoFileName: string | null;
}

export interface DepartmentCard {
  department: DepartmentItem;
  breadcrumbs: DepartmentBreadcrumb[];
  head: DepartmentMemberRef | null;
  deputy: DepartmentMemberRef | null;
  children: DepartmentItem[];
  members: {
    items: DepartmentMemberRef[];
    total: number;
    page: number;
    pageSize: number;
  };
}

/**
 * Everything `/departments/[id]` needs: the unit, its breadcrumb chain, head
 * & deputy, direct children (with counts), and one page of members. Used
 * directly by both the API route and the server-rendered card page — the
 * page fetches this, not its own API route (no self-HTTP round trip).
 * Returns `null` for a missing or archived-out (isActive:false) unit.
 */
export async function getDepartmentCard(
  id: string,
  opts: { includeArchived: boolean; page: number; pageSize: number }
): Promise<DepartmentCard | null> {
  const department = await prisma.department.findUnique({
    where: { id },
    select: { ...DEPARTMENT_SELECT, isActive: true },
  });
  if (!department || !department.isActive) return null;

  const ancestorIds = department.path.split("/");
  const ancestors = await prisma.department.findMany({
    where: { id: { in: ancestorIds } },
    select: { id: true, name: true },
  });
  const byId = new Map(ancestors.map((a) => [a.id, a]));
  const breadcrumbs = ancestorIds
    .map((aid) => byId.get(aid))
    .filter((a): a is DepartmentBreadcrumb => !!a);

  const [headUser, deputyUser] = await Promise.all([
    department.headUserId
      ? prisma.user.findUnique({ where: { id: department.headUserId }, select: DEPARTMENT_MEMBER_SLIM })
      : Promise.resolve(null),
    department.deputyUserId
      ? prisma.user.findUnique({ where: { id: department.deputyUserId }, select: DEPARTMENT_MEMBER_SLIM })
      : Promise.resolve(null),
  ]);

  // Shared with the tree route so child-unit counts on this card agree with
  // what /departments shows for the same nodes.
  const data = await loadDepartmentData(opts.includeArchived);
  const children = data.all
    .filter((d) => d.parentId === department.id)
    .map((d) => toDepartmentItem(d, data));

  const membershipWhere = {
    departmentId: department.id,
    ...(opts.includeArchived ? {} : { user: { isArchived: false } }),
  };
  const [memberRows, total] = await prisma.$transaction([
    prisma.userDepartment.findMany({
      where: membershipWhere,
      select: { user: { select: DEPARTMENT_MEMBER_SLIM } },
      orderBy: { user: { name: "asc" } },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.userDepartment.count({ where: membershipWhere }),
  ]);

  return {
    department: toDepartmentItem(department, data),
    breadcrumbs,
    head: headUser,
    deputy: deputyUser,
    children,
    members: {
      items: memberRows.map((r) => r.user),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    },
  };
}
