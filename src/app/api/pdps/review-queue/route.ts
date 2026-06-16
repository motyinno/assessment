import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireManager } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/roles";

/**
 * PDP items awaiting the caller's review. A manager sees items they're the
 * reviewer for; an admin sees every submitted item (including ones with no
 * reviewer assigned).
 */
export async function GET() {
  const auth = await requireManager();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const items = await prisma.pdpItem.findMany({
    where: {
      status: "SUBMITTED",
      ...(isAdmin(me.role) ? {} : { reviewerId: me.id }),
    },
    orderBy: { submittedAt: "asc" },
    include: {
      pdp: {
        select: {
          id: true,
          fileName: true,
          driveLink: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  return NextResponse.json(items);
}
