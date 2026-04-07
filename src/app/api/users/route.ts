import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";

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
  const { name, email, password, role, grade, project, manager } = body;

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "Имя, email и пароль обязательны" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Пользователь с таким email уже существует" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      hashedPassword,
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
