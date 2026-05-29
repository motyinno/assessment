import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export function errorJson(
  code: string,
  message: string,
  status: number,
  details?: unknown
) {
  const body: { error: ApiError } = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status });
}

export const badRequest = (msg: string, details?: unknown) =>
  errorJson("BAD_REQUEST", msg, 400, details);
export const unauthorized = (msg = "Unauthorized") =>
  errorJson("UNAUTHORIZED", msg, 401);
export const forbidden = (msg = "Forbidden") =>
  errorJson("FORBIDDEN", msg, 403);
export const notFound = (msg = "Not found") =>
  errorJson("NOT_FOUND", msg, 404);
export const conflict = (msg: string) => errorJson("CONFLICT", msg, 409);
export const serverError = (msg = "Internal server error") =>
  errorJson("SERVER_ERROR", msg, 500);

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns either { data } on success or { error: NextResponse } on failure.
 * Centralizes JSON parse errors and Zod validation errors into one consistent
 * 400 shape so every route doesn't have to reinvent it.
 */
export async function parseJsonBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, error: badRequest("Invalid JSON body") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      data: null,
      error: badRequest("Validation failed", flattenZodError(parsed.error)),
    };
  }
  return { data: parsed.data, error: null };
}

function flattenZodError(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    out[key] ||= [];
    out[key].push(issue.message);
  }
  return out;
}

/**
 * Best-effort JSON parser for our JSON-as-string DB columns. Returns the
 * fallback if the value is null/empty or unparseable. Logs malformed values
 * so they're visible in ops without crashing the request.
 */
export function parseJsonField<T>(
  raw: string | null | undefined,
  fallback: T,
  context?: string
): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    log.warn("parseJsonField: malformed JSON", {
      context,
      error: e instanceof Error ? e.message : String(e),
    });
    return fallback;
  }
}

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
