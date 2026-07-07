import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound, parseJsonBody } from "@/lib/api-helpers";
import { updateCertificateSchema } from "@/lib/schemas";
import { certVerifyUrl } from "@/lib/certificates";

/** Pin/unpin one of the caller's own certificates (controls profile visibility). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const a = await requireAuth();
  if (a.error) return a.error;
  const { id } = await params;

  const body = await parseJsonBody(req, updateCertificateSchema);
  if (body.error) return body.error;

  const cert = await prisma.certificate.findUnique({ where: { id } });
  if (!cert || cert.userId !== a.session.user.id)
    return notFound("Certificate not found");

  const updated = await prisma.certificate.update({
    where: { id },
    data: { pinned: body.data.pinned },
    select: { id: true, code: true, pinned: true, createdAt: true },
  });
  return NextResponse.json({ ...updated, verifyUrl: certVerifyUrl(updated.code) });
}

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
