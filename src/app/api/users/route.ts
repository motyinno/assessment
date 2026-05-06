import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isEmailAllowed, allowedEmailDomains } from "@/lib/allowed-domains";
import { canManagePeople, isRole } from "@/lib/roles";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  grade: true,
  project: true,
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  createdAt: true,
} as const;

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { name, email, role, grade, project, managerId } = body;

  if (!name || !email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  if (!isEmailAllowed(email)) {
    return NextResponse.json(
      {
        error: `Only corporate emails are allowed (${allowedEmailDomains
          .map((d) => `@${d}`)
          .join(", ")})`,
      },
      { status: 400 }
    );
  }

  if (role !== undefined && role !== null && !isRole(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 400 }
    );
  }

  let resolvedManagerId: string | null = null;
  if (typeof managerId === "string" && managerId.length > 0) {
    const candidate = await prisma.user.findUnique({
      where: { id: managerId },
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
    resolvedManagerId = candidate.id;
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: role || "USER",
      grade,
      project,
      managerId: resolvedManagerId,
    },
    select: USER_SELECT,
  });

  return NextResponse.json(user, { status: 201 });
}
