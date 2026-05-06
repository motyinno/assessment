import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { reviewPdpSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsed = await parseJsonBody(req, reviewPdpSchema);
  if (parsed.error) return parsed.error;
  const { action, reviewNotes } = parsed.data;

  const pdp = await prisma.pdp.findUnique({ where: { id } });
  if (!pdp) return notFound("PDP not found");
  if (pdp.status !== "ON_REVIEW") {
    return badRequest("PDP is no longer in review");
  }

  if (action === "approve") {
    const updated = await prisma.pdp.update({
      where: { id },
      data: { status: "ACTIVE", reviewNotes: null },
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
