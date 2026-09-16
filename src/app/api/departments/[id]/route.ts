import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";
import { canManagePeople } from "@/lib/roles";
import { getDepartmentCard } from "@/lib/departments";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/departments/[id] — unit card (S10 §2): the unit itself,
 * breadcrumbs, head/deputy, child units (with counts) and a paginated member
 * list. Thin wrapper over src/lib/departments.ts#getDepartmentCard, shared
 * with the server-rendered /departments/[id] page.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const sp = req.nextUrl.searchParams;
  const includeArchived = sp.get("archived") === "include" && canManagePeople(me.role);
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const card = await getDepartmentCard(params.id, { includeArchived, page, pageSize });
  if (!card) return notFound("Department not found");

  return NextResponse.json(card);
}
