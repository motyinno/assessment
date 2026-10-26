import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { bankSummary } from "@/lib/question-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Questions per matrix topic, topics the matrix lacks, and recent imports. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const division = await resolveEditableDivision(auth.session.user, new URL(req.url).searchParams.get("departmentId"));
  if (division.error) return division.error;
  return NextResponse.json(await bankSummary(division.departmentId));
}
