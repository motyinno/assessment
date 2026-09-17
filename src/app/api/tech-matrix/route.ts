import { NextResponse } from "next/server";
import { loadTechMatrix } from "@/lib/data-loader";
import { requireAuth } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/roles";
import { resolveEditableDivision, resolveUserDivision } from "@/lib/user-division";
import { notFound, serverError } from "@/lib/api-helpers";

export const runtime = "nodejs";
// The matrix is now admin-editable and DB-backed, so it must not be cached.
export const dynamic = "force-dynamic";

/**
 * Every viewer sees their OWN division's matrix (see lib/user-division.ts) —
 * no division resolved yields an empty matrix, not an error, since that's
 * the normal state for anyone HRM hasn't placed in a Division-type unit yet.
 *
 * An admin loading the `/tech-matrix/edit` editor instead passes
 * `?departmentId=` to view (and then edit via the sections/topics routes) a
 * specific division — their own (forced) if a plain admin, or any division
 * if a super-admin. Anyone else's `?departmentId=` is ignored.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  try {
    const { searchParams } = new URL(request.url);
    const requestedDepartmentId = searchParams.get("departmentId");

    let departmentId: string | null;
    if (isAdmin(me.role) && requestedDepartmentId !== null) {
      const resolved = await resolveEditableDivision(me, requestedDepartmentId);
      if (resolved.error) return resolved.error;
      departmentId = resolved.departmentId;
    } else {
      const division = await resolveUserDivision(me.id);
      departmentId = division?.id ?? null;
    }

    const matrix = departmentId ? await loadTechMatrix(departmentId) : { sections: [] };
    const sectionId = searchParams.get("section");

    if (sectionId) {
      const section = matrix.sections.find((s) => s.id === sectionId);
      if (!section) return notFound("Section not found");
      return NextResponse.json(section);
    }

    return NextResponse.json(matrix);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
