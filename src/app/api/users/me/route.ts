import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      grade: true,
      project: true,
      managerId: true,
      manager: { select: { id: true, name: true, email: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(user);
}
