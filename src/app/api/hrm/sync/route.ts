import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { serverError } from "@/lib/api-helpers";
import { startHrmSyncRun } from "@/lib/hrm/sync";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual admin-triggered HRM sync (S04). `?dryRun=1` runs the whole
 * algorithm without writing anything (report only). Same 202-immediately,
 * fire-and-forget shape as the cron entry — a manual run started right
 * before/after the nightly one lands on the same advisory lock and comes
 * back `SKIPPED_LOCKED` via the run's own status, not an HTTP error.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  try {
    const result = await startHrmSyncRun({ trigger: "MANUAL", dryRun });
    if ("skipped" in result) {
      return NextResponse.json({ skipped: true }, { status: 202 });
    }
    return NextResponse.json({ runId: result.runId }, { status: 202 });
  } catch (e) {
    log.error("hrm-sync manual: failed to start", { error: e instanceof Error ? e.message : String(e) });
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
