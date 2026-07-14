import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { patchTopicSchema } from "@/lib/schemas";
import { notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.matrixTopic.findUnique({ where: { id } });
  if (!existing) return notFound("Topic not found");

  const parsed = await parseJsonBody(req, patchTopicSchema);
  if (parsed.error) return parsed.error;

  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.order !== undefined) data.order = parsed.data.order;
  if (parsed.data.jun !== undefined) data.jun = parsed.data.jun;
  if (parsed.data.mid !== undefined) data.mid = parsed.data.mid;
  if (parsed.data.sen !== undefined) data.sen = parsed.data.sen;

  const updated = await prisma.matrixTopic.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = params;
  const existing = await prisma.matrixTopic.findUnique({ where: { id } });
  if (!existing) return notFound("Topic not found");

  await prisma.matrixTopic.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
