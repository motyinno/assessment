import { z } from "zod";

/**
 * Market report contract v1 — the structured form of a monthly client-requests
 * report. A report in this shape imports with no AI and no loss; an HTML
 * export or pasted text is first extracted by the AI into the same shape
 * (lib/ai-service.ts extractMarketReport), so everything downstream reads one
 * format. Client-safe: no server imports.
 *
 * Shares are fractions 0..1 of the period's requests; `baseline` is the same
 * share over the trailing 12 months, when the report has one.
 */

const share = z.number().min(0).max(1);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const SIGNAL_KINDS = ["skill", "practice", "constraint"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const marketReportSignalSchema = z.object({
  label: z.string().trim().min(1).max(200),
  kind: z.enum(SIGNAL_KINDS).default("skill"),
  n: z.number().int().min(0).nullish(),
  share: share.nullish(),
  baseline: share.nullish(),
  levelHint: z.string().trim().max(50).nullish(),
  evidence: z
    .array(
      z.object({
        requestId: z.string().trim().max(100).nullish(),
        quote: z.string().trim().max(1000).nullish(),
      })
    )
    .max(20)
    .default([]),
});

export const marketReportSchema = z.object({
  schema: z.literal("market-report/v1"),
  title: z.string().trim().max(200).nullish(),
  period: z.object({ from: isoDate, to: isoDate }),
  baseline: z.string().trim().max(50).nullish(),
  requests: z.number().int().min(1),
  meta: z
    .object({
      seniorShare: share.nullish(),
      juniorOnlyRequests: z.number().int().min(0).nullish(),
    })
    .passthrough()
    .default({}),
  signals: z.array(marketReportSignalSchema).min(1).max(300),
  portraits: z
    .array(z.object({ name: z.string().trim().min(1).max(200), signals: z.array(z.string().trim().min(1)).max(50) }))
    .max(20)
    .default([]),
  notes: z.array(z.string().trim().min(1).max(1000)).max(50).default([]),
});

export type MarketReport = z.infer<typeof marketReportSchema>;

/** A signal below this many requests is shown as low confidence and weighted ×0.5. */
export const LOW_CONFIDENCE_N = 5;

/** A signal ready to store (lib/market-signals.ts) — `share` always filled when derivable. */
export interface SignalInput {
  order: number;
  label: string;
  kind: SignalKind;
  share: number | null;
  baseline: number | null;
  sampleN: number | null;
  levelHint: string | null;
  evidence: Array<{ requestId?: string; quote?: string }>;
}

export interface ReportMeta {
  requests: number;
  seniorShare: number | null;
  juniorOnlyRequests: number | null;
  baseline: string | null;
  portraits: MarketReport["portraits"];
  notes: string[];
}

export type ParseResult =
  | { ok: true; report: MarketReport }
  | { ok: false; error: string; issues?: string[] };

/** Parse JSON text against the contract; issues are flattened to "path: message" lines. */
export function parseMarketReport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Not valid JSON" };
  }
  return validateMarketReport(raw);
}

export function validateMarketReport(raw: unknown): ParseResult {
  const parsed = marketReportSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "The report doesn't match market-report/v1",
      issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  if (parsed.data.period.from > parsed.data.period.to) {
    return { ok: false, error: "period.from is after period.to" };
  }
  return { ok: true, report: parsed.data };
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/**
 * Report → signals. `share` and `n` fill each other in from `requests` when
 * only one is given; duplicate labels (case-insensitive) keep the first.
 */
export function reportToSignals(report: MarketReport): SignalInput[] {
  const seen = new Set<string>();
  const out: SignalInput[] = [];
  for (const s of report.signals) {
    const key = s.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = s.n ?? (s.share != null ? Math.round(s.share * report.requests) : null);
    const sh = s.share ?? (s.n != null ? Math.min(1, s.n / report.requests) : null);
    out.push({
      order: out.length,
      label: s.label,
      kind: s.kind,
      share: sh == null ? null : round4(sh),
      baseline: s.baseline ?? null,
      sampleN: n,
      levelHint: s.levelHint ?? null,
      evidence: s.evidence.map((e) => ({
        ...(e.requestId ? { requestId: e.requestId } : {}),
        ...(e.quote ? { quote: e.quote } : {}),
      })),
    });
  }
  return out;
}

export function reportMeta(report: MarketReport): ReportMeta {
  return {
    requests: report.requests,
    seniorShare: report.meta.seniorShare ?? null,
    juniorOnlyRequests: report.meta.juniorOnlyRequests ?? null,
    baseline: report.baseline ?? null,
    portraits: report.portraits,
    notes: report.notes,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Market Sep 2026" for a one-month period, "Market Jul–Sep 2026" otherwise. */
export function reportTitle(period: { from: string; to: string }): string {
  const [fy, fm] = period.from.split("-").map(Number);
  const [ty, tm] = period.to.split("-").map(Number);
  const to = `${MONTHS[tm - 1]} ${ty}`;
  if (fy === ty && fm === tm) return `Market ${to}`;
  return fy === ty ? `Market ${MONTHS[fm - 1]}–${to}` : `Market ${MONTHS[fm - 1]} ${fy}–${to}`;
}

/** Change against the 12-month baseline in percentage points, or null without a baseline. */
export function deltaPp(s: { share: number | null; baseline: number | null }): number | null {
  if (s.share == null || s.baseline == null) return null;
  return Math.round((s.share - s.baseline) * 1000) / 10;
}

export const isLowConfidence = (s: { sampleN: number | null }) => s.sampleN != null && s.sampleN < LOW_CONFIDENCE_N;

/** "68.9%" */
export const pct = (x: number | null | undefined) => (x == null ? "—" : `${(Math.round(x * 1000) / 10).toFixed(1)}%`);

/** "+18.8 pp" / "−7.2 pp" */
export function ppLabel(d: number | null): string {
  if (d == null) return "—";
  const v = Math.abs(d).toFixed(1);
  return d > 0 ? `+${v} pp` : d < 0 ? `−${v} pp` : `0.0 pp`;
}
