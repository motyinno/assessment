import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { serverError } from "@/lib/api-helpers";
import { buildRoadmap } from "@/lib/roadmap";

export const runtime = "nodejs";

/** Returns the interactive roadmap (matrix + per-topic status) for the caller. */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const roadmap = await buildRoadmap(auth.session.user.id);
    return NextResponse.json(roadmap);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
