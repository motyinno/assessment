import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { serverError } from "@/lib/api-helpers";
import { regenerateTopicForToday } from "@/lib/daily-topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: replace today's topic with a freshly generated one. */
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const topic = await regenerateTopicForToday();
    if (!topic) {
      return serverError("Failed to generate a new topic. Please try again.");
    }
    return NextResponse.json({ topic });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
