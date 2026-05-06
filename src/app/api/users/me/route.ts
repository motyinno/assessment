import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
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

  if (!user) return notFound("Not found");
  return NextResponse.json(user);
}
