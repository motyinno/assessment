import type { Grade } from "@/lib/types";
import { BAND_LABELS } from "@/lib/roadmap-types";
import { deltaPp, isLowConfidence, pct, ppLabel } from "@/lib/market-report";

/**
 * Topic ranking for a PDP built on market signals. Client-safe and pure — the
 * server loads the inputs (lib/market-signals.ts loadRecommendationInputs),
 * this decides the order, so the same numbers show in the picker and get
 * stored on the plan.
 *
 *   fit = demand × trend × levelFit × gap
 *
 * - demand: the month's share blended with the 12-month baseline
 *   (0.6 / 0.4) so one noisy month doesn't reshape plans; the month alone when
 *   the report has no baseline. Several signals on one topic → the strongest.
 * - trend: 1 + clamp(Δpp / 40, −0.25, +0.25).
 * - levelFit: 1 when the topic has skills at the target band, else 0 (the
 *   topic is listed as hidden for this level).
 * - gap: 1 − progress at the target band, progress being the assessment score
 *   /10 or the share of ticked roadmap questions, whichever is higher. Nothing
 *   known = 1. The market-vs-assessment slider softens it: with assessment
 *   weight a, the factor is 1 − a × (1 − gap), so a = 0 ignores progress and
 *   a = 1 applies the gap in full.
 * - A topic the market is silent about gets the level-baseline weight instead
 *   of demand, so required basics still show up, below the market topics.
 * - A signal from fewer than 5 requests counts at half weight.
 */

export interface FitWeights {
  monthWeight: number;
  yearWeight: number;
  trendDivisor: number;
  trendCap: number;
  baselineWeight: number;
  lowConfidenceFactor: number;
  /** 0..1 — how much the assessment gap counts against market demand. */
  assessmentWeight: number;
}

export const DEFAULT_WEIGHTS: FitWeights = {
  monthWeight: 0.6,
  yearWeight: 0.4,
  trendDivisor: 40,
  trendCap: 0.25,
  // The matrix has no "required for the next level" flag yet, so every topic
  // without a market signal is a baseline candidate; kept low so they rank
  // under the market topics instead of crowding them out.
  baselineWeight: 0.1,
  lowConfidenceFactor: 0.5,
  assessmentWeight: 0.4,
};

/** Δ at or beyond ±10 pp tags a topic Hot / Cooling. */
export const TREND_TAG_PP = 10;
export type TrendTag = "hot" | "cooling" | null;

export function trendTag(d: number | null): TrendTag {
  if (d == null) return null;
  if (d >= TREND_TAG_PP) return "hot";
  if (d <= -TREND_TAG_PP) return "cooling";
  return null;
}

export interface FitTopic {
  id: string;
  title: string;
  sectionTitle: string;
  skills: Record<Grade, string[]>;
}

export interface FitSignal {
  id: string;
  sourceId: string;
  sourceTitle: string;
  label: string;
  topicId: string;
  share: number | null;
  baseline: number | null;
  sampleN: number | null;
}

/** Progress at the target band, from the roadmap. */
export interface FitProgress {
  score: number | null; // 0-10
  resolved: number;
  total: number;
}

export interface RankedSignal {
  id: string;
  label: string;
  sourceTitle: string;
  share: number | null;
  baseline: number | null;
  deltaPp: number | null;
  sampleN: number | null;
  lowConfidence: boolean;
}

export type TopicOrigin = "market" | "baseline";

export interface RankedTopic {
  topicId: string;
  title: string;
  sectionTitle: string;
  /** Skills at the target band — the only column the plan draws from. */
  skills: string[];
  fit: number;
  demand: number;
  trend: number;
  gap: number;
  hidden: boolean;
  origin: TopicOrigin;
  trendTag: TrendTag;
  /** The signal that set the demand, first; the rest after. */
  signals: RankedSignal[];
  progress: FitProgress | null;
  /** The employee's side only ("assessed 5/10"), for UIs that show demand as a chip. */
  progressNote: string;
  /** The full one-liner stored on the plan's goal. */
  reason: string;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

export function signalDemand(s: Pick<FitSignal, "share" | "baseline" | "sampleN">, w: FitWeights = DEFAULT_WEIGHTS): number {
  if (s.share == null) return 0;
  const blended = s.baseline == null ? s.share : w.monthWeight * s.share + w.yearWeight * s.baseline;
  return isLowConfidence(s) ? blended * w.lowConfidenceFactor : blended;
}

export function trendFactor(d: number | null, w: FitWeights = DEFAULT_WEIGHTS): number {
  if (d == null) return 1;
  return 1 + clamp(d / w.trendDivisor, -w.trendCap, w.trendCap);
}

export function gapOf(p: FitProgress | null | undefined): number {
  if (!p) return 1;
  const fromScore = p.score != null ? clamp(p.score / 10, 0, 1) : 0;
  const fromTicks = p.total > 0 ? p.resolved / p.total : 0;
  return 1 - Math.max(fromScore, fromTicks);
}

function progressLabel(p: FitProgress | null, useGap: boolean, band: Grade): string {
  if (!useGap) return "";
  if (!p || (p.score == null && p.resolved === 0)) return `Not assessed at ${BAND_LABELS[band]} yet, no roadmap progress`;
  if (p.score != null) return `Assessed ${p.score}/10`;
  return `${p.resolved}/${p.total} questions ticked`;
}

export interface RankOptions {
  targetBand: Grade;
  useGap: boolean;
  weights?: Partial<FitWeights>;
}

/**
 * Rank every topic that either has skills at the target band or carries a
 * market signal. Hidden topics (signal but no skills at the band) are kept,
 * with fit 0, so the picker can say why they're missing.
 */
export function rankTopics(
  topics: FitTopic[],
  signals: FitSignal[],
  progress: Map<string, FitProgress>,
  opts: RankOptions
): RankedTopic[] {
  const w = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const byTopic = new Map<string, FitSignal[]>();
  for (const s of signals) {
    const list = byTopic.get(s.topicId) ?? [];
    list.push(s);
    byTopic.set(s.topicId, list);
  }

  const out: RankedTopic[] = [];
  for (const t of topics) {
    const skills = t.skills[opts.targetBand] ?? [];
    const own = byTopic.get(t.id) ?? [];
    if (skills.length === 0 && own.length === 0) continue;

    const ranked = own
      .map((s) => ({ s, demand: signalDemand(s, w) }))
      .sort((a, b) => b.demand - a.demand);
    const lead = ranked[0];
    const p = progress.get(t.id) ?? null;
    const gap = opts.useGap ? gapOf(p) : 1;
    const gapFactor = 1 - w.assessmentWeight * (1 - gap);
    const hidden = skills.length === 0;
    const origin: TopicOrigin = lead && lead.demand > 0 ? "market" : "baseline";
    const demand = origin === "market" ? lead.demand : w.baselineWeight;
    const d = origin === "market" ? deltaPp(lead.s) : null;
    const trend = trendFactor(d, w);
    const fit = hidden ? 0 : round2(demand * trend * gapFactor);

    const signalsOut: RankedSignal[] = ranked.map(({ s }) => ({
      id: s.id,
      label: s.label,
      sourceTitle: s.sourceTitle,
      share: s.share,
      baseline: s.baseline,
      deltaPp: deltaPp(s),
      sampleN: s.sampleN,
      lowConfidence: isLowConfidence(s),
    }));

    out.push({
      topicId: t.id,
      title: t.title,
      sectionTitle: t.sectionTitle,
      skills,
      fit,
      demand: round2(demand),
      trend: round2(trend),
      gap: round2(gap),
      hidden,
      origin,
      trendTag: trendTag(d),
      signals: signalsOut,
      progress: p,
      progressNote: progressLabel(p, opts.useGap, opts.targetBand),
      reason: explain({ origin, hidden, lead: signalsOut[0], progress: p, useGap: opts.useGap, band: opts.targetBand }),
    });
  }

  return out.sort((a, b) => b.fit - a.fit || b.demand - a.demand || a.title.localeCompare(b.title));
}

function explain(x: {
  origin: TopicOrigin;
  hidden: boolean;
  lead: RankedSignal | undefined;
  progress: FitProgress | null;
  useGap: boolean;
  band: Grade;
}): string {
  if (x.hidden) return `No ${BAND_LABELS[x.band]} questions in this topic — hidden for this level`;
  const parts: string[] = [];
  if (x.origin === "market" && x.lead) {
    let m = `${x.lead.label}: ${pct(x.lead.share)} of requests`;
    if (x.lead.baseline != null) m += ` (12 mo ${pct(x.lead.baseline)}, ${ppLabel(x.lead.deltaPp)})`;
    if (x.lead.lowConfidence) m += `, low confidence (n=${x.lead.sampleN})`;
    parts.push(m);
  } else {
    parts.push("Level baseline — no market signal");
  }
  const prog = progressLabel(x.progress, x.useGap, x.band);
  if (prog) parts.push(prog[0].toLowerCase() + prog.slice(1));
  return parts.join("; ");
}

/** Topics preselected in the picker: the top `max` visible ones with a positive fit. */
export function preselect(ranked: RankedTopic[], max: number): string[] {
  return ranked
    .filter((r) => !r.hidden && r.fit > 0)
    .slice(0, max)
    .map((r) => r.topicId);
}

/** Stored on Pdp.basis. */
export interface PdpBasis {
  sourceIds: string[];
  targetBand: Grade;
  horizonMonths: number;
  maxTopics: number;
  useGap: boolean;
  weights: FitWeights;
  /** "Market Sep 2026 + assessment" — what the lists show. */
  label: string;
}

export function basisLabel(sourceTitles: string[], usedAssessment: boolean): string {
  const parts = [...sourceTitles];
  if (usedAssessment) parts.push("assessment");
  return parts.join(" + ") || "Manual";
}

/** Read Pdp.basis defensively (it's Json). */
export function readBasisLabel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const label = (raw as { label?: unknown }).label;
  return typeof label === "string" && label ? label : null;
}

/**
 * The band a plan aims at by default: Trainee/Intern work toward Junior;
 * everyone else toward the next band, staying put at Senior.
 */
export function defaultTargetBand(grade: string | null | undefined): Grade {
  if (!grade || grade === "Trainee" || grade === "Intern") return "jun";
  const base = grade.replace(/[+\-]$/, "");
  if (base === "jun") return "mid";
  return "sen";
}
