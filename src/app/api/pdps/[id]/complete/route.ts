import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp } from "@/lib/pdp-plan";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";

const bodySchema = z.object({ note: z.string().trim().max(2000).optional() });

/**
 * The manager closes the whole plan (ACTIVE → COMPLETED). Their call: the
 * employee doesn't have to tick every item first.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { id: true, managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(me, pdp.user))) return forbidden("Only the employee's manager can close their PDP");
  if (pdp.status !== "ACTIVE") return badRequest("Only an active PDP can be closed");

  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const note = parsed.data.note || null;

  const updated = await prisma.pdp.update({
    where: { id: pdp.id },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: me.id, completionNote: note },
    select: { id: true, status: true, completedAt: true },
  });
  return NextResponse.json(updated);
}
