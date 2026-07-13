import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { forbidden, serverError } from "@/lib/api-helpers";
import { isStaff } from "@/lib/roles";
import { buildRoadmap } from "@/lib/roadmap";

export const runtime = "nodejs";

/**
 * A user's roadmap. Viewable by anyone who can see their profile — staff
 * (assessor/manager/admin) or the user themselves.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const me = auth.session.user;
  if (!isStaff(me.role) && me.id !== id) return forbidden();

  try {
    const roadmap = await buildRoadmap(id);
    return NextResponse.json(roadmap);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
