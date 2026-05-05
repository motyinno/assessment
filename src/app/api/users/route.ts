import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isEmailAllowed, allowedEmailDomains } from "@/lib/allowed-domains";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      grade: true,
      project: true,
      manager: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const { name, email, role, grade, project, manager } = body;

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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists" },
      { status: 400 }
    );
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: role || "USER",
      grade,
      project,
      manager,
    },
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

  return NextResponse.json(user, { status: 201 });
}
