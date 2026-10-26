import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { listDivisions, resolveUserDivision } from "@/lib/user-division";
import { badRequest } from "@/lib/api-helpers";
import { matrixInterviewStats } from "@/lib/question-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How often clients ask about each topic and skill of a division's matrix —
 * the "often asked" marks. Readable like the matrix itself.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const requested = new URL(req.url).searchParams.get("departmentId");
  const division = requested
    ? (await listDivisions()).find((d) => d.id === requested) ?? null
    : await resolveUserDivision(auth.session.user.id);
  if (requested && !division) return badRequest("Unknown division");
  if (!division) return NextResponse.json({ topics: {}, skills: {}, oftenAsked: 3 });
  return NextResponse.json(await matrixInterviewStats(division.id));
}
