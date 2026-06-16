import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";
import { deriveItemsFromDriveDoc } from "@/lib/pdp-items";

/**
 * Preview the checklist items that would be created from a PDP's current
 * document, so the admin can eyeball (and trim) them before approving. Does not
 * write anything.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const pdp = await prisma.pdp.findUnique({
    where: { id },
    select: { id: true, driveFileId: true, createdById: true, userId: true },
  });
  if (!pdp) return notFound("PDP not found");

  const items = pdp.driveFileId
    ? await deriveItemsFromDriveDoc(pdp.createdById ?? pdp.userId, pdp.driveFileId)
    : [];

  return NextResponse.json({ items });
}
