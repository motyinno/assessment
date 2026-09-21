import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { isSuperAdmin } from "@/lib/roles";
import { listDivisions, resolveUserDivision } from "@/lib/user-division";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For the tech-matrix / session-templates admin editors: a super-admin gets
 * every Division to choose from; a plain admin gets just their own resolved
 * one (there's nothing to pick — they can only ever edit that division).
 *
 * `own` is returned for BOTH, so the editors can open on the caller's own
 * division instead of whatever sorts first alphabetically. A super-admin's
 * `own` is only a starting point — they may switch to any division, and the
 * write guards still demand an explicit departmentId from them (see
 * lib/user-division.ts#resolveEditableDivision).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const own = await resolveUserDivision(me.id);

  if (isSuperAdmin(me)) {
    return NextResponse.json({ divisions: await listDivisions(), own });
  }

  return NextResponse.json({ divisions: own ? [own] : [], own });
}
