import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { reviewPdpSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";
import { deriveItemsFromDriveDoc, type DerivedPdpItem } from "@/lib/pdp-items";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsed = await parseJsonBody(req, reviewPdpSchema);
  if (parsed.error) return parsed.error;
  const { action, reviewNotes, items } = parsed.data;

  const pdp = await prisma.pdp.findUnique({
    where: { id },
    include: { user: { select: { managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (pdp.status !== "ON_REVIEW") {
    return badRequest("PDP is no longer in review");
  }

  if (action === "approve") {
    // Build the checklist from the *final* document the admin just reviewed:
    // either the list they curated on screen, or — if they didn't touch it — by
    // parsing the document fresh. This captures any edits made during review.
    let finalItems: DerivedPdpItem[] = items ?? [];
    if (!items && pdp.driveFileId) {
      finalItems = await deriveItemsFromDriveDoc(pdp.createdById ?? pdp.userId, pdp.driveFileId);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Approval is the single point items are created; clear any stragglers
      // first so re-running can't duplicate them.
      await tx.pdpItem.deleteMany({ where: { pdpId: id } });
      if (finalItems.length > 0) {
        await tx.pdpItem.createMany({
          data: finalItems.map((it, idx) => ({
            pdpId: id,
            type: it.type,
            category: it.category,
            title: it.title,
            order: idx,
            reviewerId: pdp.user.managerId,
          })),
        });
      }
      return tx.pdp.update({
        where: { id },
        data: { status: "ACTIVE", reviewNotes: null },
      });
    });
    return NextResponse.json(updated);
  }

  // action === "comment"
  const notes = (reviewNotes ?? "").trim();
  const updated = await prisma.pdp.update({
    where: { id },
    data: { reviewNotes: notes.length > 0 ? notes : null },
  });
  return NextResponse.json(updated);
}
