import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { createSectionSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createSectionSchema);
  if (parsed.error) return parsed.error;
  const { title } = parsed.data;

  const existing = await prisma.matrixSection.findMany({
    select: { id: true },
  });
  const taken = new Set(existing.map((s) => s.id));
  const id = uniqueSlug(title, taken);
  const order = existing.length;

  const section = await prisma.matrixSection.create({
    data: { id, title, order },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(section, { status: 201 });
}
