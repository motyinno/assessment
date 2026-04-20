import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const { id } = params;

  // Users can edit own profile, assessors can edit anyone
  if (session!.user.id !== id && session!.user.role !== "ASSESSOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, grade, project, manager, role } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (grade !== undefined) data.grade = grade;
  if (project !== undefined) data.project = project;
  if (manager !== undefined) data.manager = manager;

  // Only assessors can change roles
  if (role !== undefined && session!.user.role === "ASSESSOR") {
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
