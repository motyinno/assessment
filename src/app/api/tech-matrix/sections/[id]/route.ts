import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { patchSectionSchema } from "@/lib/schemas";
import { notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.matrixSection.findUnique({ where: { id } });
  if (!existing) return notFound("Section not found");

  const parsed = await parseJsonBody(req, patchSectionSchema);
  if (parsed.error) return parsed.error;

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;

  const updated = await prisma.matrixSection.update({
    where: { id },
    data,
    include: { topics: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.matrixSection.findUnique({ where: { id } });
  if (!existing) return notFound("Section not found");

  // Topics cascade via the FK. Any RoadmapProgress / SelfAssessment rows that
  // referenced this section's topics are left orphaned but harmless — they are
  // filtered out when the roadmap is rebuilt against the current matrix.
  await prisma.matrixSection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
