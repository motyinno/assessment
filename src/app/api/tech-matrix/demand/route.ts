import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { listDivisions, resolveUserDivision } from "@/lib/user-division";
import { badRequest } from "@/lib/api-helpers";
import { topicDemand } from "@/lib/matrix-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Client demand per topic from the division's published market report — the
 * badges on the matrix screens. Readable by anyone who can read the matrix.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const requested = new URL(req.url).searchParams.get("departmentId");
  const division = requested
    ? (await listDivisions()).find((d) => d.id === requested) ?? null
    : await resolveUserDivision(auth.session.user.id);
  if (requested && !division) return badRequest("Unknown division");
  if (!division) return NextResponse.json({ source: null, topics: {} });
  return NextResponse.json(await topicDemand(division.id));
}
