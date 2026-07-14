import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { patchSessionTemplateSchema } from "@/lib/schemas";
import { notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.sessionTemplate.findUnique({ where: { id } });
  if (!existing) return notFound("Session template not found");

  const parsed = await parseJsonBody(req, patchSessionTemplateSchema);
  if (parsed.error) return parsed.error;

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;
  if (parsed.data.durationMin !== undefined)
    data.durationMin = parsed.data.durationMin;
  if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;

  const updated = await prisma.sessionTemplate.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.sessionTemplate.findUnique({ where: { id } });
  if (!existing) return notFound("Session template not found");

  await prisma.sessionTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
