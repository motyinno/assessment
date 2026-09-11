import prisma from "@/lib/prisma";

/**
 * Non-staff shape for department members / head / deputy (S10). Deliberately
 * the *only* select used for people inside a department response — unlike
 * `/api/users`, which conditionally widens to STAFF_USER_SELECT by role,
 * `/api/departments*` gives every role the same shape. Grade, project(s) and
 * manager must never leak here (S10 spec, "Что видно обычному пользователю").
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

/** Shared copy for the "membership counted more than once" caveat (S10 F2). */
export const MULTI_MEMBERSHIP_NOTE =
  "Сотрудники, состоящие в нескольких юнитах, учитываются в каждом — сумма по дереву может превышать штат компании.";
