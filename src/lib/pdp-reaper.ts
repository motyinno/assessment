import prisma from "@/lib/prisma";
import { log } from "@/lib/api-helpers";

/**
 * Mark long-running GENERATING PDPs as FAILED.
 *
 * The PDP generation flow is fire-and-forget — if the server crashes mid-job
 * the row is stuck in GENERATING forever and the user sees a permanent
 * spinner. This sweeper is a backstop that flips them to FAILED after
 * `staleAfterMin` minutes so the UI can recover and offer a retry.
 */
export async function reapStaleGeneratingPdps(staleAfterMin = 15): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMin * 60_000);
  const result = await prisma.pdp.updateMany({
    where: {
      status: "GENERATING",
      startedAt: { lt: cutoff },
    },
    data: {
      status: "FAILED",
      error: `PDP generation timed out (>${staleAfterMin} min). Try again.`,
    },
  });
  if (result.count > 0) {
    log.info("Reaped stale GENERATING PDPs", { count: result.count });
  }
  return result.count;
}

let started = false;
const HOUR_MS = 60 * 60_000;

/**
 * Idempotent: starts a single interval per process. Safe to call from any
 * route handler — first call wins.
 */
export function startPdpReaper() {
  if (started) return;
  started = true;
  // Run once on first call so a crash-restart cleans up immediately.
  void reapStaleGeneratingPdps().catch((e) =>
    log.warn("PDP reaper initial pass failed", {
      error: e instanceof Error ? e.message : String(e),
    })
  );
  const handle = setInterval(() => {
    void reapStaleGeneratingPdps().catch((e) =>
      log.warn("PDP reaper periodic pass failed", {
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }, HOUR_MS);
  handle.unref?.();
}
