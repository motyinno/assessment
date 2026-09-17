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
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  if (isSuperAdmin(me)) {
    return NextResponse.json({ divisions: await listDivisions(), own: null });
  }

  const own = await resolveUserDivision(me.id);
  return NextResponse.json({ divisions: own ? [own] : [], own });
}
