import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { isStaff } from "@/lib/roles";
import { notFound, forbidden } from "@/lib/api-helpers";

/**
 * A single PDP with its checklist items. Visible to the owner, any staff member
 * (assessor/manager/admin), so both the employee's plan view and the reviewer's
 * view can read it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const { id } = await params;
  const pdp = await prisma.pdp.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, managerId: true } },
      createdBy: { select: { id: true, name: true } },
      assessment: { select: { id: true, title: true } },
      items: {
        orderBy: { order: "asc" },
        include: { reviewer: { select: { id: true, name: true } } },
      },
    },
  });

  if (!pdp) return notFound("PDP not found");

  const isOwner = pdp.userId === me.id;
  if (!isOwner && !isStaff(me.role)) return forbidden();
  // The owner only sees their plan once it's past admin review; before that
  // it's a staff-only draft (its checklist isn't finalized yet).
  if (isOwner && !isStaff(me.role) && (pdp.status === "ON_REVIEW" || pdp.status === "GENERATING")) {
    return notFound("PDP not found");
  }

  return NextResponse.json(pdp);
}
