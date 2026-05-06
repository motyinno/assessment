import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isValidGrade } from "@/lib/grades";
import { ROLES, canManagePeople } from "@/lib/roles";

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
  const { error, session } = await requireAuth();
  if (error) return error;

  const viewerRole = session!.user.role;
  const isStaffViewer = canManagePeople(viewerRole) || viewerRole === "ASSESSOR";

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
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}

const VALID_ROLES = new Set<string>(ROLES);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { id } = params;
  const isAdmin = session!.user.role === "ADMIN";
  const isSelf = session!.user.id === id;

  const current = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, managerId: true },
  });
  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isManagerOfTarget =
    canManagePeople(session!.user.role) &&
    current.managerId === session!.user.id;

  if (!isAdmin && !isSelf && !isManagerOfTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, grade, project, managerId, role } = body as Record<string, unknown>;

  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    data.name = name.trim();
  }

  if (project !== undefined) {
    data.project = typeof project === "string" && project.trim().length > 0 ? project.trim() : null;
  }

  if (managerId !== undefined) {
    const normalized =
      managerId === null || managerId === "" ? null : managerId;
    const unchanged = normalized === (current.managerId ?? null);

    if (unchanged) {
      // Skip validation: caller is just echoing back the existing value.
    } else if (normalized === null) {
      data.managerId = null;
    } else if (typeof normalized !== "string") {
      return NextResponse.json({ error: "Invalid managerId" }, { status: 400 });
    } else if (normalized === id) {
      return NextResponse.json({ error: "User cannot be their own manager" }, { status: 400 });
    } else {
      const candidate = await prisma.user.findUnique({
        where: { id: normalized },
        select: { id: true, role: true },
      });
      if (!candidate) {
        return NextResponse.json({ error: "Manager not found" }, { status: 400 });
      }
      if (!canManagePeople(candidate.role)) {
        return NextResponse.json(
          { error: "Manager must have role MANAGER or ADMIN" },
          { status: 400 }
        );
      }
      data.managerId = candidate.id;
    }
  }

  if (grade !== undefined) {
    if (!isAdmin && !isManagerOfTarget) {
      return NextResponse.json(
        { error: "Only administrators or the user's manager can change grade" },
        { status: 403 }
      );
    }
    if (grade === null || grade === "") {
      data.grade = null;
    } else if (isValidGrade(grade)) {
      data.grade = grade;
    } else {
      return NextResponse.json({ error: "Invalid grade" }, { status: 400 });
    }
  }

  let demotingFromManager = false;
  if (role !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only administrators can change role" }, { status: 403 });
    }
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (isSelf && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Can't change your own role away from administrator" },
        { status: 400 }
      );
    }
    data.role = role;

    if (!canManagePeople(role) && canManagePeople(current.role)) {
      demotingFromManager = true;
    }
  }

  const updateUser = prisma.user.update({
    where: { id },
    data,
    select: USER_DETAIL_SELECT,
  });

  let user;
  if (demotingFromManager) {
    const [, updated] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      }),
      updateUser,
    ]);
    user = updated;
  } else {
    user = await updateUser;
  }

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { id } = params;

  if (session!.user.id === id) {
    return NextResponse.json(
      { error: "Can't delete your own account" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      _count: { select: { participations: true, pdps: true } },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target._count.participations > 0 || target._count.pdps > 0) {
    return NextResponse.json(
      {
        error:
          "User has associated assessments or PDPs. Deletion blocked.",
      },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
