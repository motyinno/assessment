/**
 * Postgres advisory lock so only one HRM sync runs at a time, across
 * processes (cron trigger and a manual admin trigger racing each other).
 * `pg_try_advisory_lock` is non-blocking — a concurrent run doesn't queue
 * behind the first, it fails fast so the caller can report SKIPPED_LOCKED
 * instead of an admin waiting on a spinner for an hour.
 *
 * One fixed key (`hashtext('hrm-sync')`) — there's only ever one sync kind to
 * serialize, so no need to parametrize the lock name.
 */
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";

const LOCK_KEY_EXPR = "hashtext('hrm-sync')";

async function tryAcquire(): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ pg_try_advisory_lock: boolean }[]>(
    `SELECT pg_try_advisory_lock(${LOCK_KEY_EXPR}) AS pg_try_advisory_lock`
  );
  return rows[0]?.pg_try_advisory_lock === true;
}

async function release(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_KEY_EXPR})`);
  } catch (e) {
    // Releasing must never throw past this — a failed unlock still lets the
    // session-scoped lock go away when the connection is returned to the
    // pool; logging is enough to catch a real pattern of failures.
    log.warn("hrm: pg_advisory_unlock failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Runs `fn` only if the lock was acquired; releases it in `finally` even if
 * `fn` throws. Returns `{ acquired: false }` without calling `fn` when
 * another run already holds the lock.
 */
export async function withHrmSyncLock<T>(
  fn: () => Promise<T>
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const acquired = await tryAcquire();
  if (!acquired) return { acquired: false };

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    await release();
  }
}
