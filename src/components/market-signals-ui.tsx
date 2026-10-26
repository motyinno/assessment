"use client";

import { Badge } from "@/components/ui/badge";
import { pct } from "@/lib/market-report";

/** Shared bits of the market-signals screens (sources list, review, PDP basis). */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 2026", "Jul–Sep 2026", or "—". Dates are stored at UTC midnight. */
export function periodLabel(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const f = new Date(from);
  const t = new Date(to);
  const end = `${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
  if (f.getUTCFullYear() === t.getUTCFullYear() && f.getUTCMonth() === t.getUTCMonth()) return end;
  if (f.getUTCFullYear() === t.getUTCFullYear()) return `${MONTHS[f.getUTCMonth()]}–${end}`;
  return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}–${end}`;
}

const FORMAT_LABEL: Record<string, string> = { json: "JSON contract", html: "HTML export", text: "pasted text" };

/** "45 client requests · baseline: trailing-12m · HTML export" */
export function reportMetaLine(meta: Record<string, unknown> | null | undefined, format: string): string {
  const parts: string[] = [];
  const requests = typeof meta?.requests === "number" ? meta.requests : null;
  if (requests) parts.push(`${requests} client requests`);
  if (typeof meta?.baseline === "string" && meta.baseline) parts.push(`baseline: ${meta.baseline}`);
  parts.push(FORMAT_LABEL[format] ?? format);
  return parts.join(" · ");
}

export type SourceStatus = "PROCESSING" | "FAILED" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";

export function SourceStatusBadge({ status }: { status: SourceStatus }) {
  switch (status) {
    case "PROCESSING":
      return <Badge variant="info">Processing…</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    case "IN_REVIEW":
      return <Badge variant="warning">In review</Badge>;
    case "PUBLISHED":
      return <Badge variant="success">Published</Badge>;
    case "ARCHIVED":
      return <Badge variant="secondary">Archived</Badge>;
  }
}

export type MappingState = "UNMAPPED" | "MAPPED" | "PROPOSAL" | "OUT_OF_SCOPE";

export const MAPPING_LABEL: Record<MappingState, string> = {
  MAPPED: "Mapped",
  PROPOSAL: "Proposal",
  OUT_OF_SCOPE: "Out of scope",
  UNMAPPED: "Unmapped",
};

export function MappingBadge({ state }: { state: MappingState }) {
  const variant = state === "MAPPED" ? "success" : state === "PROPOSAL" ? "info" : state === "UNMAPPED" ? "warning" : "secondary";
  return <Badge variant={variant}>{MAPPING_LABEL[state]}</Badge>;
}

/** "Market 68.9% · +18.8 pp" chip. */
export function MarketChip({ label, share, deltaPp }: { label?: string; share: number | null; deltaPp: number | null }) {
  const delta = deltaPp == null ? "" : ` · ${deltaPp > 0 ? "+" : deltaPp < 0 ? "−" : ""}${Math.abs(deltaPp).toFixed(1)} pp`;
  return (
    <Badge variant="info">
      Market {label ? `${label} ` : ""}
      {pct(share)}
      {delta}
    </Badge>
  );
}
