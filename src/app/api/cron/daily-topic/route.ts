import { NextRequest, NextResponse } from "next/server";
import { unauthorized, serverError } from "@/lib/api-helpers";
import { getTopicOfTheDay } from "@/lib/daily-topic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly cron entry (see docker-compose `cron` service). Ensures today's topic
 * is generated so the first visitor in the morning doesn't wait on Gemini.
 *
 * Auth: requires the CRON_SECRET as a Bearer token or `?secret=`. If CRON_SECRET
 * is unset the endpoint is disabled (503) rather than left open.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return serverError("CRON_SECRET is not configured");
  }

  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(req.url).searchParams.get("secret") ??
    "";
  if (provided !== secret) return unauthorized();

  try {
    const topic = await getTopicOfTheDay();
    return NextResponse.json({
      ok: !!topic,
      title: topic?.title ?? null,
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}

export const GET = handle;
export const POST = handle;
