import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";
import { canManagePeople } from "@/lib/roles";
import {
  DEPARTMENT_MEMBER_SLIM,
  loadDepartmentData,
  toDepartmentItem,
} from "@/lib/departments";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/departments/[id] — unit card (S10 §2): the unit itself,
 * breadcrumbs, head/deputy, child units (with counts) and a paginated member
 * list. `members`/`head`/`deputy` all use DEPARTMENT_MEMBER_SLIM — the only
 * select used for people in this route, no staff-only widening like
 * /api/users has, since grade/project/manager must not appear here for
 * anyone (S10 spec, "Что видно обычному пользователю").
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;
  const { id } = params;

  const department = await prisma.department.findUnique({
    where: { id },
    select: {
      id: true,
      hrmId: true,
      name: true,
      typeName: true,
      isFilterable: true,
      isSinglePerson: true,
      parentId: true,
      depth: true,
      path: true,
      isActive: true,
      headUserId: true,
      deputyUserId: true,
    },
  });
  if (!department || !department.isActive) return notFound("Department not found");

  const sp = req.nextUrl.searchParams;
  const includeArchived = sp.get("archived") === "include" && canManagePeople(me.role);
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  // Breadcrumbs: `path` is a "/"-joined id chain, root first, self last.
  // `findMany({ id: { in } })` doesn't preserve order, so restore it by index.
  const ancestorIds = department.path.split("/");
  const ancestors = await prisma.department.findMany({
    where: { id: { in: ancestorIds } },
    select: { id: true, name: true },
  });
  const byId = new Map(ancestors.map((a) => [a.id, a]));
  const breadcrumbs = ancestorIds
    .map((aid) => byId.get(aid))
    .filter((a): a is { id: string; name: string } => !!a);

  const [headUser, deputyUser] = await Promise.all([
    department.headUserId
      ? prisma.user.findUnique({ where: { id: department.headUserId }, select: DEPARTMENT_MEMBER_SLIM })
      : Promise.resolve(null),
    department.deputyUserId
      ? prisma.user.findUnique({ where: { id: department.deputyUserId }, select: DEPARTMENT_MEMBER_SLIM })
      : Promise.resolve(null),
  ]);

  // Shared with the tree route so child-unit counts (in this card) agree
  // with what /departments shows for the same nodes.
  const data = await loadDepartmentData(includeArchived);
  const children = data.all
    .filter((d) => d.parentId === department.id)
    .map((d) => toDepartmentItem(d, data));

  const membershipWhere = {
    departmentId: department.id,
    ...(includeArchived ? {} : { user: { isArchived: false } }),
  };
  const [memberRows, total] = await prisma.$transaction([
    prisma.userDepartment.findMany({
      where: membershipWhere,
      select: { user: { select: DEPARTMENT_MEMBER_SLIM } },
      orderBy: { user: { name: "asc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.userDepartment.count({ where: membershipWhere }),
  ]);

  return NextResponse.json({
    department: {
      id: department.id,
      hrmId: department.hrmId,
      name: department.name,
      typeName: department.typeName,
      isFilterable: department.isFilterable,
      isSinglePerson: department.isSinglePerson,
      parentId: department.parentId,
      depth: department.depth,
      path: department.path,
      memberCount: data.memberCount.get(department.id) ?? 0,
      memberCountWithDescendants: data.withDescendants.get(department.id) ?? 0,
    },
    breadcrumbs,
    head: headUser,
    deputy: deputyUser,
    children,
    members: {
      items: memberRows.map((r) => r.user),
      total,
      page,
      pageSize,
    },
  });
}
