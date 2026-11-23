import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { createSectionSchema, reorderSectionsSchema } from "@/lib/schemas";
import { conflict, parseJsonBody } from "@/lib/api-helpers";
import { isPermutation } from "@/lib/section-order";
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
    select: { id: true, departmentId: true, order: true },
  });
  const taken = new Set(existing.map((s) => s.id));
  const id = uniqueSlug(title, taken);
  // Append after the current last section. A plain count would collide with
  // an existing order once a section in the middle has been deleted.
  const orders = existing
    .filter((s) => s.departmentId === departmentId)
    .map((s) => s.order);
  const order = orders.length ? Math.max(...orders) + 1 : 0;

  const section = await prisma.matrixSection.create({
    data: { id, departmentId, title, order },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json(section, { status: 201 });
}

/**
 * Reorder a division's sections: body `{ departmentId?, sectionIds }` lists
 * every section id of that division in the new order. Orders are rewritten to
 * 0..n-1 in one transaction. A list that isn't exactly the division's current
 * sections (stale editor) is rejected with 409 so the client can reload.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, reorderSectionsSchema);
  if (parsed.error) return parsed.error;
  const { sectionIds, departmentId: requestedDepartmentId } = parsed.data;

  const division = await resolveEditableDivision(auth.session.user, requestedDepartmentId ?? null);
  if (division.error) return division.error;
  const { departmentId } = division;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.matrixSection.findMany({
      where: { departmentId },
      select: { id: true },
    });
    if (!isPermutation(current.map((s) => s.id), sectionIds)) return false;
    for (const [order, id] of sectionIds.entries()) {
      await tx.matrixSection.update({ where: { id }, data: { order } });
    }
    return true;
  });
  if (!result) {
    return conflict("The section list changed since it was loaded — reload and try again");
  }
  return NextResponse.json({ ok: true, sectionIds });
}
