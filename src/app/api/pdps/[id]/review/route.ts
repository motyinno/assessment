import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const body = (await req.json()) as {
    action?: "approve" | "comment";
    reviewNotes?: string;
  };

  const pdp = await prisma.pdp.findUnique({ where: { id } });
  if (!pdp) {
    return NextResponse.json({ error: "ИПР не найден" }, { status: 404 });
  }
  if (pdp.status !== "ON_REVIEW") {
    return NextResponse.json(
      { error: "ИПР уже не на проверке" },
      { status: 400 }
    );
  }

  if (body.action === "approve") {
    const updated = await prisma.pdp.update({
      where: { id },
      data: { status: "ACTIVE", reviewNotes: null },
    });
    return NextResponse.json(updated);
  }

  if (body.action === "comment") {
    const notes =
      typeof body.reviewNotes === "string" ? body.reviewNotes.trim() : "";
    const updated = await prisma.pdp.update({
      where: { id },
      data: { reviewNotes: notes.length > 0 ? notes : null },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(
    { error: "Неизвестное действие" },
    { status: 400 }
  );
}
