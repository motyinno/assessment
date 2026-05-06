import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  requireAdmin,
} from "@/lib/auth-helpers";
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
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
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
    select: { id: true, role: true, managerId: true },
  });
  if (!current) return notFound("User not found");

  const isManagerOfTarget =
    canManagePeople(me.role) && current.managerId === me.id;

  if (!isAdminCaller && !isSelf && !isManagerOfTarget) return forbidden();

  const parsed = await parseJsonBody(req, patchUserSchema);
  if (parsed.error) return parsed.error;
  const { name, grade, project, managerId, role } = parsed.data;

  const data: Record<string, unknown> = {};

  if (name !== undefined) data.name = name.trim();
  if (project !== undefined) {
    data.project = project && project.trim().length > 0 ? project.trim() : null;
  }

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
  if (role !== undefined) {
    if (!isAdminCaller) return forbidden("Only administrators can change role");
    if (!VALID_ROLES.has(role)) return badRequest("Invalid role");
    if (isSelf && role !== "ADMIN") {
      return conflict("Can't change your own role away from administrator");
    }
    data.role = role as UserRole;
    if (!canManagePeople(role) && canManagePeople(current.role)) {
      demotingFromManager = true;
    }
  }

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
      _count: { select: { participations: true, pdps: true } },
    },
  });
  if (!target) return notFound("User not found");

  if (target._count.participations > 0 || target._count.pdps > 0) {
    return conflict(
      "User has associated assessments or PDPs. Deletion blocked."
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
