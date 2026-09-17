import { NextResponse } from "next/server";
import { loadTechMatrix } from "@/lib/data-loader";
import { requireAuth } from "@/lib/auth-helpers";
import { listDivisions, resolveUserDivision } from "@/lib/user-division";
import { badRequest, notFound, serverError } from "@/lib/api-helpers";

export const runtime = "nodejs";
// The matrix is now admin-editable and DB-backed, so it must not be cached.
export const dynamic = "force-dynamic";

/**
 * Defaults to the caller's OWN division (see lib/user-division.ts). No division
 * resolved yields an empty matrix, not an error — that's the normal state for
 * anyone HRM hasn't placed in a Division-type unit yet.
 *
 * `?departmentId=` reads ANY active division's matrix, for any signed-in user.
 * Reading is deliberately not gated: the matrix is internal reference material
 * (which skills each grade is expected to have), and people do look across
 * divisions. It used to be admin-only and routed through
 * `resolveEditableDivision`, which answers a different question — who may EDIT
 * this division — and so refused a plain admin any division but their own, and
 * silently ignored the parameter for everyone else.
 *
 * WRITING is untouched: the sections/topics routes still guard every mutation
 * with `resolveEditableDivision`/`assertCanEditDivision`, and the editor's own
 * picker is fed by `/api/tech-matrix/divisions`, which already narrows a plain
 * admin to their own division. So a wider read here cannot widen edit rights.
 *
 * The response carries the division it resolved, so the caller can label and
 * preselect a picker without a second round trip.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  try {
    const { searchParams } = new URL(request.url);
    const requestedDepartmentId = searchParams.get("departmentId");

    let division: { id: string; name: string } | null;
    if (requestedDepartmentId) {
      // Validated against the real Division list, so this can't be pointed at
      // an arbitrary department id.
      division = (await listDivisions()).find((d) => d.id === requestedDepartmentId) ?? null;
      if (!division) return badRequest("Unknown division");
    } else {
      division = await resolveUserDivision(me.id);
    }

    const matrix = division ? await loadTechMatrix(division.id) : { sections: [] };
    const sectionId = searchParams.get("section");

    if (sectionId) {
      const section = matrix.sections.find((s) => s.id === sectionId);
      if (!section) return notFound("Section not found");
      return NextResponse.json(section);
    }

    return NextResponse.json({ ...matrix, division });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
