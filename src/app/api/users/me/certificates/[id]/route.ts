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

  const cert = await prisma.certificate.findUnique({ where: { id } });
  if (!cert || cert.userId !== a.session.user.id)
    return notFound("Certificate not found");

  await prisma.certificate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
