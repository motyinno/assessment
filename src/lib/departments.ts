import prisma from "@/lib/prisma";

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
 * Active membership counts per department, "in unit" only (not summed over
 * descendants — callers that need the subtree total add path-prefix sums
 * themselves, see department-tree building in the route). One `groupBy`,
 * not N queries per node.
 */
export async function getMemberCounts(
  includeArchived: boolean
): Promise<Map<string, number>> {
  const counts = await prisma.userDepartment.groupBy({
    by: ["departmentId"],
    where: includeArchived ? {} : { user: { isArchived: false } },
    _count: { userId: true },
  });
  return new Map(counts.map((c) => [c.departmentId, c._count.userId]));
}

/**
 * Sums `memberCount` over a department and every descendant, using the
 * `path` prefix convention from `rebuildDepartmentPaths` (src/lib/hrm/tree.ts):
 * a node's subtree is every row whose `path` starts with `${path}/`, plus
 * the node itself. O(depts × avgChildren) in memory — no per-node SQL.
 */
export function withDescendantCounts<T extends { id: string; path: string }>(
  nodes: T[],
  memberCount: Map<string, number>
): Map<string, number> {
  const withDescendants = new Map<string, number>();
  for (const node of nodes) {
    let sum = memberCount.get(node.id) ?? 0;
    for (const other of nodes) {
      if (other.id !== node.id && other.path.startsWith(`${node.path}/`)) {
        sum += memberCount.get(other.id) ?? 0;
      }
    }
    withDescendants.set(node.id, sum);
  }
  return withDescendants;
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
  memberCount: number;
  memberCountWithDescendants: number;
  head: DepartmentHeadRef | null;
}

export interface DepartmentData {
  all: DepartmentRow[];
  memberCount: Map<string, number>;
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
  const memberCount = await getMemberCounts(includeArchived);
  const withDescendants = withDescendantCounts(all, memberCount);
  const headRefs = await getHeadRefs(all.flatMap((d) => [d.headUserId, d.deputyUserId]));
  return { all, memberCount, withDescendants, headRefs };
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
 * memberCountWithDescendants is 0 every descendant's is too (the sum only
 * grows going down), so nothing downstream gets orphaned by removing it.
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

/** Nests `survivors` into root-level items with recursive `children`. */
export function buildDepartmentTree(
  survivors: DepartmentRow[],
  data: DepartmentData
): DepartmentTreeItem[] {
  const survivorIds = new Set(survivors.map((d) => d.id));
  const childrenOf = new Map<string, DepartmentRow[]>();
  const roots: DepartmentRow[] = [];
  for (const d of survivors) {
    const parentKnown = d.parentId !== null && survivorIds.has(d.parentId);
    if (parentKnown) {
      const list = childrenOf.get(d.parentId as string) ?? [];
      list.push(d);
      childrenOf.set(d.parentId as string, list);
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
