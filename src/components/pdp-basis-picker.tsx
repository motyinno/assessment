"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api-error";
import { BAND_LABELS } from "@/lib/roadmap-types";
import type { FitWeights, RankedTopic } from "@/lib/market-fit";
import { MarketChip } from "@/components/market-signals-ui";

/**
 * Step 1 + 2 of a market-driven PDP (Create PDP → "What is the plan based
 * on?"): pick sources, target level, horizon and max topics; the server ranks
 * the division's matrix topics (lib/market-fit.ts) and the top ones come
 * preselected. Selection is lifted to the page so the legacy matrix picker and
 * this list share one set of topic ids.
 */

export type Band = "jun" | "mid" | "sen";

interface BasisSource {
  id: string;
  title: string;
  status: "PUBLISHED" | "ARCHIVED";
  meta: { requests?: number } | null;
}

interface Options {
  sources: BasisSource[];
  completedAssessments: number;
  defaults: { targetBand: Band; horizonMonths: number; maxTopics: number; weights: FitWeights };
}

export interface BasisSettings {
  sourceIds: string[];
  targetBand: Band;
  horizonMonths: number;
  maxTopics: number;
  useGap: boolean;
  weights: Partial<FitWeights>;
}

interface Props {
  userId: string;
  currentBand: Band;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  onSettings: (s: BasisSettings | null) => void;
  /** True when the division has sources to base a plan on (or once that's known). */
  onAvailability: (available: boolean) => void;
}

export function PdpBasisPicker({ userId, currentBand, selected, setSelected, onSettings, onAvailability }: Props) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [targetBand, setTargetBand] = useState<Band>("jun");
  const [horizonMonths, setHorizonMonths] = useState(3);
  const [maxTopics, setMaxTopics] = useState(5);
  const [useGap, setUseGap] = useState(true);
  const [assessmentWeight, setAssessmentWeight] = useState(0.4);
  const [ranked, setRanked] = useState<RankedTopic[] | null>(null);
  const [ranking, setRanking] = useState(false);
  const touched = useRef(false);
  const lastSelectionKey = useRef("");

  useEffect(() => {
    fetch(`/api/users/${userId}/pdp-recommendations`).then(async (r) => {
      const data = await r.json().catch(() => null);
      if (!r.ok) {
        setError(apiErrorMessage(data, "Couldn't load the plan sources"));
        onAvailability(false);
        return;
      }
      const o = data as Options;
      setOptions(o);
      setTargetBand(o.defaults.targetBand);
      setHorizonMonths(o.defaults.horizonMonths);
      setMaxTopics(o.defaults.maxTopics);
      setAssessmentWeight(o.defaults.weights.assessmentWeight);
      const published = o.sources.filter((s) => s.status === "PUBLISHED").map((s) => s.id);
      setSourceIds(published);
      onAvailability(o.sources.length > 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const settings: BasisSettings | null = useMemo(
    () =>
      options
        ? { sourceIds, targetBand, horizonMonths, maxTopics, useGap, weights: { assessmentWeight } }
        : null,
    [options, sourceIds, targetBand, horizonMonths, maxTopics, useGap, assessmentWeight]
  );

  useEffect(() => {
    onSettings(settings);
    if (!settings) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setRanking(true);
      try {
        const r = await fetch(`/api/users/${userId}/pdp-recommendations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
          signal: ctrl.signal,
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
          setError(apiErrorMessage(data, "Couldn't rank the topics"));
          return;
        }
        setError(null);
        setRanked(data.ranked);
        // Re-preselect when what defines the shortlist changes, unless the
        // manager already ticked topics by hand.
        const key = `${settings.sourceIds.join(",")}|${settings.targetBand}|${settings.maxTopics}`;
        if (key !== lastSelectionKey.current && !touched.current) setSelected(new Set(data.preselected));
        lastSelectionKey.current = key;
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setError("Couldn't rank the topics");
      } finally {
        setRanking(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, userId]);

  function toggle(id: string) {
    touched.current = true;
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function toggleSource(id: string) {
    touched.current = false;
    setSourceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (error && !options) return <p className="text-sm text-destructive">{error}</p>;
  if (!options) return <p className="text-muted-foreground">Loading…</p>;

  const visible = (ranked ?? []).filter((r) => !r.hidden);
  const hidden = (ranked ?? []).filter((r) => r.hidden);
  const maxFit = Math.max(0.01, ...visible.map((r) => r.fit));
  const bandOptions: Band[] = ["jun", "mid", "sen"];
  const noAssessment = options.completedAssessments === 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">1 · What is the plan based on?</CardTitle>
          <span className="text-xs text-muted-foreground">Pick one or more. Every source becomes weighted signals on tech matrix topics.</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {options.sources.map((s) => (
              <Tile key={s.id} active={sourceIds.includes(s.id)} onClick={() => toggleSource(s.id)}>
                <div className="text-sm font-semibold">Market report</div>
                <div className="text-xs text-muted-foreground">
                  {s.title}
                  {s.meta?.requests ? ` · ${s.meta.requests} requests` : ""}
                </div>
                <Badge variant={s.status === "PUBLISHED" ? "success" : "secondary"} className="mt-2">
                  {s.status === "PUBLISHED" ? "Published" : "Archived"}
                </Badge>
              </Tile>
            ))}
            <Tile active={useGap} onClick={() => setUseGap((v) => !v)}>
              <div className="text-sm font-semibold">Last assessment</div>
              <div className="text-xs text-muted-foreground">
                {noAssessment
                  ? "None yet — gaps come from roadmap progress, or count as full"
                  : `${options.completedAssessments} completed · gaps from scores and roadmap progress`}
              </div>
            </Tile>
            <Tile later>
              <div className="text-sm font-semibold">Manager note</div>
              <div className="text-xs text-muted-foreground">Free text: project needs, feedback, goals</div>
            </Tile>
            <Tile later>
              <div className="text-sm font-semibold">Upload anything</div>
              <div className="text-xs text-muted-foreground">Client request, CV, report — parsed like a source</div>
            </Tile>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t pt-4 text-sm">
            <label className="flex items-center gap-2">
              Target level
              <select className="h-8 rounded-lg border bg-background px-2" value={targetBand} onChange={(e) => { touched.current = false; setTargetBand(e.target.value as Band); }}>
                {bandOptions.map((b) => (
                  <option key={b} value={b}>
                    {BAND_LABELS[b]}
                    {b === options.defaults.targetBand ? " (next)" : b === currentBand ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Horizon
              <select className="h-8 rounded-lg border bg-background px-2" value={horizonMonths} onChange={(e) => setHorizonMonths(Number(e.target.value))}>
                {[3, 6, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              Max topics
              <input
                type="number"
                min={1}
                max={15}
                className="h-8 w-16 rounded-lg border bg-background px-2"
                value={maxTopics}
                onChange={(e) => {
                  touched.current = false;
                  setMaxTopics(Math.min(15, Math.max(1, Number(e.target.value) || 1)));
                }}
              />
            </label>
            <span className="text-xs text-muted-foreground">Only the target-level column of each topic is used.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between gap-2">
            <CardTitle className="text-base">2 · Recommended topics</CardTitle>
            <span className="text-xs text-muted-foreground">
              {ranking ? "Ranking…" : `${visible.filter((r) => selected.has(r.topicId)).length} selected · ranked by fit`}
            </span>
          </CardHeader>
          <CardContent className="px-0">
            {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}
            <div className="divide-y">
              {visible.map((r) => (
                <label key={r.topicId} className="flex cursor-pointer items-start gap-3 px-6 py-3 hover:bg-muted/40">
                  <input type="checkbox" className="mt-1" checked={selected.has(r.topicId)} onChange={() => toggle(r.topicId)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{r.title}</span>
                      <span className="text-xs text-muted-foreground">{r.sectionTitle}</span>
                      {r.trendTag === "hot" && <Badge variant="warning">Hot</Badge>}
                      {r.origin === "market" && r.signals[0] ? (
                        <MarketChip
                          label={r.title.toLowerCase().includes(r.signals[0].label.toLowerCase()) ? undefined : r.signals[0].label}
                          share={r.signals[0].share}
                          deltaPp={r.signals[0].deltaPp}
                        />
                      ) : (
                        <Badge variant="success">Level baseline</Badge>
                      )}
                      {r.trendTag === "cooling" && <Badge variant="secondary">Cooling</Badge>}
                      {r.signals[0]?.lowConfidence && <Badge variant="outline">Low confidence</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm">
                      {r.origin === "market"
                        ? [r.signals.length > 1 ? `Also: ${r.signals.slice(1).map((x) => x.label).join(", ")}` : "", r.progressNote]
                            .filter(Boolean)
                            .join(". ")
                        : `Not in the market report — a ${BAND_LABELS[targetBand]} topic of the matrix. ${r.progressNote}.`}
                      {r.signals[0]?.lowConfidence ? ` Under 5 requests (n=${r.signals[0].sampleN}), counted at half weight.` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {BAND_LABELS[targetBand]} column: {r.skills.join(", ")}
                    </p>
                  </div>
                  <div className="w-24 shrink-0 pt-1 text-right">
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.round((r.fit / maxFit) * 100)}%` }} />
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">fit {r.fit.toFixed(2)}</div>
                  </div>
                </label>
              ))}
              {ranked && visible.length === 0 && (
                <p className="px-6 py-3 text-sm text-muted-foreground">The division's matrix has no {BAND_LABELS[targetBand]} topics yet.</p>
              )}
            </div>
            {hidden.length > 0 && (
              <div className="mx-6 mt-3 rounded-lg bg-muted/50 p-3 text-xs">
                <div className="font-medium">Hidden for this level</div>
                <p className="mt-0.5 text-muted-foreground">
                  {hidden.map((h) => h.title).join(", ")} — clients ask for them, but the topics have no {BAND_LABELS[targetBand]} questions.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">How topics are ranked</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <pre className="rounded-lg bg-muted p-3 font-mono text-xs">{"fit = demand × trend\n    × level fit × gap"}</pre>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li><b className="text-foreground">demand</b> — share of requests, blended with 12 months (0.6 / 0.4)</li>
              <li><b className="text-foreground">trend</b> — Δ pp, capped at ±25% so one month can't dominate</li>
              <li><b className="text-foreground">level fit</b> — does the topic have questions at the target level</li>
              <li><b className="text-foreground">gap</b> — 1 − last assessment score or roadmap progress; 1 when unknown</li>
              <li>Topics the market is silent about get the level-baseline weight and are flagged as such</li>
              <li>Signals from under 5 requests count at half weight</li>
            </ul>
            <div className="space-y-1 border-t pt-3">
              <div className="text-xs font-medium">Market vs. assessment weight</div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                className="w-full accent-[var(--primary)]"
                disabled={!useGap}
                value={Math.round((1 - assessmentWeight) * 100)}
                onChange={(e) => setAssessmentWeight(1 - Number(e.target.value) / 100)}
              />
              <div className="text-xs text-muted-foreground">
                {useGap
                  ? `${Math.round((1 - assessmentWeight) * 100)}% market · ${Math.round(assessmentWeight * 100)}% assessment${noAssessment ? " — no assessment yet, so roadmap progress or the market decides" : ""}`
                  : "Assessment not used — the market decides."}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tile(props: { active?: boolean; later?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={props.later}
      onClick={props.onClick}
      className={[
        "rounded-xl border p-3 text-left transition-colors",
        props.active ? "border-primary bg-primary/5 ring-1 ring-primary/40" : "hover:bg-muted/50",
        props.later ? "cursor-not-allowed bg-muted/40 opacity-60 hover:bg-muted/40" : "",
      ].join(" ")}
    >
      {props.children}
      {props.later && <Badge variant="secondary" className="mt-2">Later</Badge>}
    </button>
  );
}
