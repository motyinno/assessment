import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";

/** Mark a single notification as read (only the owner may do so). */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const { id } = await params;

  const result = await prisma.notification.updateMany({
    where: { id, userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });

  // Either already read or not owned by the caller / nonexistent.
  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: { id, userId: me.id },
      select: { id: true },
    });
    if (!exists) return notFound("Notification not found");
  }

  return NextResponse.json({ ok: true });
}
