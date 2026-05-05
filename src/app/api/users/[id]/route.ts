import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isValidGrade } from "@/lib/grades";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const viewerRole = session!.user.role;
  const isStaff = viewerRole === "ASSESSOR" || viewerRole === "ADMIN";

  const { id } = params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      grade: true,
      project: true,
      manager: true,
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
        where: isStaff ? undefined : { status: { not: "ON_REVIEW" } },
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

const VALID_ROLES = new Set(["USER", "ASSESSOR", "ADMIN"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { id } = params;
  const isAdmin = session!.user.role === "ADMIN";
  const isSelf = session!.user.id === id;

  // Only admins can edit other users. Anyone can edit their own profile.
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, grade, project, manager, role } = body as Record<string, unknown>;

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

  if (manager !== undefined) {
    data.manager = typeof manager === "string" && manager.trim().length > 0 ? manager.trim() : null;
  }

  // Grade and role are admin-only.
  if (grade !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only administrators can change grade" }, { status: 403 });
    }
    if (grade === null || grade === "") {
      data.grade = null;
    } else if (isValidGrade(grade)) {
      data.grade = grade;
    } else {
      return NextResponse.json({ error: "Invalid grade" }, { status: 400 });
    }
  }

  if (role !== undefined) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only administrators can change role" }, { status: 403 });
    }
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    // Prevent an admin from demoting themselves — otherwise they could
    // lock the whole system out of admin access.
    if (isSelf && role !== "ADMIN") {
      return NextResponse.json(
        { error: "Can't change your own role away from administrator" },
        { status: 400 }
      );
    }
    data.role = role;
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      grade: true,
      project: true,
      manager: true,
    },
  });

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
