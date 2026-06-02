import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

/** List the current user's notifications (newest first) + unread count. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

/** Mark all of the current user's notifications as read. */
export async function PATCH() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
