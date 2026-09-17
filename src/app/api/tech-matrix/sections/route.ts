import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { createSectionSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createSectionSchema);
  if (parsed.error) return parsed.error;
  const { title, departmentId: requestedDepartmentId } = parsed.data;

  const division = await resolveEditableDivision(auth.session.user, requestedDepartmentId ?? null);
  if (division.error) return division.error;
  const { departmentId } = division;

  // Ids stay a global primary key (unchanged) — collision-check against
  // every section company-wide, not just this department's.
  const existing = await prisma.matrixSection.findMany({
    select: { id: true, departmentId: true },
  });
  const taken = new Set(existing.map((s) => s.id));
  const id = uniqueSlug(title, taken);
  const order = existing.filter((s) => s.departmentId === departmentId).length;

  const section = await prisma.matrixSection.create({
    data: { id, departmentId, title, order },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(section, { status: 201 });
}
