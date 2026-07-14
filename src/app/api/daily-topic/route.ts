import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { serverError } from "@/lib/api-helpers";
import { getTopicOfTheDay } from "@/lib/daily-topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's "Topic of the day" (generated + cached on first request of the day). */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const topic = await getTopicOfTheDay();
    // 200 with null when generation is unavailable — the UI hides the widget.
    return NextResponse.json({ topic });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
