import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { badRequest, notFound } from "@/lib/api-helpers";

export const runtime = "nodejs";

// Remove a FAILED pdp from a user's list. Restricted to FAILED so an ACTIVE or
// ON_REVIEW plan (which has a real Drive document behind it) can't be dropped by
// accident. A failed row never produced a Drive file, so nothing else to clean up.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const pdp = await prisma.pdp.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!pdp) return notFound("PDP not found");

  // Caller must be ADMIN, the subject user, or the subject's manager.
  const guard = await requireUserAccess(pdp.userId);
  if (guard.error) return guard.error;

  if (pdp.status !== "FAILED") {
    return badRequest("Only failed PDPs can be removed");
  }

  await prisma.pdp.delete({ where: { id: pdp.id } });
  return NextResponse.json({ ok: true });
}
