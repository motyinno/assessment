/**
 * JSONL logger, kept dependency-free (no `next/server` import) so it can be
 * loaded from plain `tsx` scripts and from `src/lib/hrm/*`, which must import
 * cleanly outside the Next.js runtime (see scripts/hrm-ping.ts).
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function fmt(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const entry = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  // Single line so docker/cloud log collectors can ingest as JSONL.
  return JSON.stringify(entry);
}

export const log = {
  debug(msg: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(fmt("debug", msg, meta));
    }
  },
  info(msg: string, meta?: Record<string, unknown>) {
    console.log(fmt("info", msg, meta));
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    console.warn(fmt("warn", msg, meta));
  },
  error(msg: string, meta?: Record<string, unknown>) {
    console.error(fmt("error", msg, meta));
  },
};
