import { NextRequest, NextResponse } from "next/server";
import { unauthorized, serverError } from "@/lib/api-helpers";
import { startHrmSyncRun } from "@/lib/hrm/sync";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Nightly cron entry (see docker-compose `cron` service). Same auth scheme as
 * `daily-topic/route.ts`: CRON_SECRET as a Bearer token or `?secret=`,
 * disabled (503) rather than open when the secret isn't configured.
 *
 * Answers 202 with the run's id immediately — the sync itself runs in the
 * background and can take minutes, well past curl/Caddy/proxy timeouts.
 * `HRM_SYNC_ENABLED=false` -> `skipped: true`, no HrmSyncRun row created.
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
    const result = await startHrmSyncRun({ trigger: "CRON" });
    if ("skipped" in result) {
      return NextResponse.json({ skipped: true }, { status: 202 });
    }
    return NextResponse.json({ runId: result.runId }, { status: 202 });
  } catch (e) {
    log.error("hrm-sync cron: failed to start", { error: e instanceof Error ? e.message : String(e) });
    return serverError(e instanceof Error ? e.message : String(e));
  }
}

export const GET = handle;
export const POST = handle;
