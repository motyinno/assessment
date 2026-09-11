import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

/**
 * GET /api/departments — minimal contract for now.
 *
 * `?q=` (search by name) and `?filterable=1` (only units usable as a filter —
 * excludes single-seat positions like CEO, S10 §"Правила отображения"). Backs
 * the department picker used by the `/users` filter (S09). S10 later extends
 * this route to the full tree/counts/head contract; this stays a strict
 * subset so that upgrade is additive.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const filterableOnly = sp.get("filterable") === "1";

  const items = await prisma.department.findMany({
    where: {
      isActive: true,
      ...(filterableOnly ? { isFilterable: true } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    select: { id: true, name: true, path: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json({ items });
}
