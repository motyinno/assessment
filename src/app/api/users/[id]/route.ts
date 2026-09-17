import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  requireAdmin,
} from "@/lib/auth-helpers";
import { getAdminDepartmentScope, getStaffDepartmentScope, isUserInScope } from "@/lib/admin-scope";
import { isValidGrade } from "@/lib/grades";
import { ROLES, canManagePeople, isAdmin, isStaff } from "@/lib/roles";
import { patchUserSchema } from "@/lib/schemas";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  parseJsonBody,
} from "@/lib/api-helpers";
import type { UserRole } from "@prisma/client";

const USER_DETAIL_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  grade: true,
  project: true,
  projects: true,
  jobTitle: true,
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  isArchived: true,
  photoFileName: true,
  hrmEmployeeId: true,
  // "Position in the company" card.
  professionalLevel: true,
  managerialLevel: true,
  isMentor: true,
  isDeliveryCoordinator: true,
  // "Org. structure" card: `typeName` is what splits the flat membership list
  // into Unit / Division / Department / Team / Group / Person rows.
  departments: {
    select: {
      department: { select: { id: true, name: true, typeName: true, isFilterable: true } },
    },
  },
  division: { select: { id: true, name: true } },
  // Units this person heads. Drives the "Head of X" badge: heading a unit is
  // what earns most of these people their ADMIN role (see lib/hrm/roles.ts),
  // and without it a department head is indistinguishable from someone who
  // got ADMIN off an M3+ managerial level.
  headedDepartments: {
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, typeName: true },
  },
  // "Managerial structure" card. `manager` is null for a level HRM left empty
  // or whose person isn't synced — rendered as "-", same as HRM does.
  managerLinks: {
    orderBy: { level: "asc" },
    select: {
      level: true,
      manager: { select: { id: true, name: true } },
    },
  },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const isStaffViewer = isStaff(me.role);

  const { id } = params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...USER_DETAIL_SELECT,
      participations: {
        where: { participantRole: "SUBJECT" },
        orderBy: { createdAt: "desc" },
        include: {
          assessment: {
            select: {
              id: true,
              title: true,
              status: true,
              grade: true,
              assessmentType: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      },
      pdps: {
        where: isStaffViewer ? undefined : { status: { not: "ON_REVIEW" } },
        orderBy: { createdAt: "desc" },
        include: {
          assessment: { select: { id: true, title: true } },
        },
      },
    },
  });
  if (!user) return notFound("Not found");

  // Staff viewing someone else's profile (not their own, not a direct
  // report) only ever see people within their own department scope — same
  // rule as the directory list and the PATCH/DELETE guards below.
  if (isStaffViewer && me.id !== id && user.managerId !== me.id) {
    const scope = await getStaffDepartmentScope(me);
    if (!(await isUserInScope(id, scope))) return forbidden();
  }

  return NextResponse.json(user);
}

const VALID_ROLES = new Set<string>(ROLES);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const { id } = params;
  const isAdminCaller = isAdmin(me.role);
  const isSelf = me.id === id;

  const current = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, managerId: true, hrmEmployeeId: true },
  });
  if (!current) return notFound("User not found");

  const isManagerOfTarget =
    canManagePeople(me.role) && current.managerId === me.id;

  if (!isAdminCaller && !isSelf && !isManagerOfTarget) return forbidden();

  // A plain ADMIN (not self, not the target's manager) may only reach here
  // via isAdminCaller — restrict that path to the target's own department
  // scope; self-edits and manager-of-target edits are unaffected.
  if (isAdminCaller && !isSelf && !isManagerOfTarget) {
    const scope = await getAdminDepartmentScope(me);
    if (!(await isUserInScope(id, scope))) return forbidden();
  }

  const parsed = await parseJsonBody(req, patchUserSchema);
  if (parsed.error) return parsed.error;
  const { name, grade, project, projects, managerId, role } = parsed.data;

  // Once HRM owns a user (hrmEmployeeId set), name/project(s)/managerId come
  // from the sync (see hrm/apply-user.ts's field policy) and manual edits
  // would just get overwritten by the next sync anyway. `grade` and `role`
  // stay editable — the sync never writes over a non-empty grade, and role
  // is a product decision HRM doesn't make (S05).
  if (current.hrmEmployeeId !== null) {
    if (name !== undefined || project !== undefined || projects !== undefined || managerId !== undefined) {
      return conflict("Managed by HRM: name, project(s) and manager can't be edited manually");
    }
  }

  const data: Record<string, unknown> = {};

  if (name !== undefined) data.name = name.trim();
  if (project !== undefined) {
    data.project = project && project.trim().length > 0 ? project.trim() : null;
  }
  if (projects !== undefined) data.projects = projects;

  if (managerId !== undefined) {
    const normalized = managerId === null || managerId === "" ? null : managerId;
    const unchanged = normalized === (current.managerId ?? null);
    if (!unchanged) {
      if (normalized === null) {
        data.managerId = null;
      } else if (normalized === id) {
        return badRequest("User cannot be their own manager");
      } else {
        const candidate = await prisma.user.findUnique({
          where: { id: normalized },
          select: { id: true, role: true },
        });
        if (!candidate) return badRequest("Manager not found");
        if (!canManagePeople(candidate.role)) {
          return badRequest("Manager must have role MANAGER or ADMIN");
        }
        data.managerId = candidate.id;
      }
    }
  }

  if (grade !== undefined) {
    if (!isAdminCaller && !isManagerOfTarget) {
      return forbidden("Only administrators or the user's manager can change grade");
    }
    if (grade === null || grade === "") {
      data.grade = null;
    } else if (isValidGrade(grade)) {
      data.grade = grade;
    } else {
      return badRequest("Invalid grade");
    }
  }

  let demotingFromManager = false;
  let previousRole: UserRole | null = null;
  if (role !== undefined) {
    if (!isAdminCaller) return forbidden("Only administrators can change role");
    if (!VALID_ROLES.has(role)) return badRequest("Invalid role");
    if (isSelf && role !== "ADMIN") {
      return conflict("Can't change your own role away from administrator");
    }
    previousRole = current.role;
    data.role = role as UserRole;
    if (!canManagePeople(role) && canManagePeople(current.role)) {
      demotingFromManager = true;
    }
  }

  // A role change is audited (source: MANUAL) alongside the update, in the
  // same transaction so the log can't be lost to a failure between the two
  // writes — see RoleAuditLog (S05).
  const roleAuditData =
    previousRole !== null
      ? {
          userId: id,
          previousRole,
          newRole: data.role as UserRole,
          source: "MANUAL" as const,
          actorId: me.id,
        }
      : null;

  let user;
  if (demotingFromManager) {
    const [, updated] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      }),
      prisma.user.update({
        where: { id },
        data,
        select: USER_DETAIL_SELECT,
      }),
      ...(roleAuditData ? [prisma.roleAuditLog.create({ data: roleAuditData })] : []),
    ]);
    user = updated;
  } else if (roleAuditData) {
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data,
        select: USER_DETAIL_SELECT,
      }),
      prisma.roleAuditLog.create({ data: roleAuditData }),
    ]);
    user = updated;
  } else {
    user = await prisma.user.update({
      where: { id },
      data,
      select: USER_DETAIL_SELECT,
    });
  }

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const { id } = params;
  if (me.id === id) return badRequest("Can't delete your own account");

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      hrmEmployeeId: true,
      _count: { select: { participations: true, pdps: true } },
    },
  });
  if (!target) return notFound("User not found");

  const scope = await getAdminDepartmentScope(me);
  if (!(await isUserInScope(id, scope))) return forbidden();

  if (target.hrmEmployeeId !== null) {
    return conflict("Archive instead of deleting an HRM-managed user");
  }

  if (target._count.participations > 0 || target._count.pdps > 0) {
    return conflict(
      "User has associated assessments or PDPs. Deletion blocked."
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
