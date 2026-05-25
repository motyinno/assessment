import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth();
  if (a.error) return a.error;
  const { id } = await params;

  const token = await prisma.apiToken.findUnique({ where: { id } });
  if (!token || token.userId !== a.session.user.id) return notFound("Token not found");

  await prisma.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
