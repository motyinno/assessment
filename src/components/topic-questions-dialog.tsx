"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { HEAT_CLASS, heatOf } from "@/components/interview-stats";

/**
 * Every question asked at client interviews for one matrix topic, grouped by
 * the skill it tests (lib/question-bank.ts). Opened from the matrix: the
 * topic's "N interview questions" badge, or a tinted skill (scrolls to it).
 */

type Band = "jun" | "mid" | "sen";
const BANDS: Band[] = ["jun", "mid", "sen"];
const BAND_LABEL: Record<Band, string> = { jun: "Junior", mid: "Middle", sen: "Senior" };
const BAND_DOT: Record<Band, string> = { jun: "bg-emerald-400", mid: "bg-blue-400", sen: "bg-purple-400" };

interface Question {
  id: string;
  text: string;
  kind: "THEORY" | "EXPERIENCE" | "BEHAVIORAL" | "BACKGROUND";
  band: string | null;
  timesAsked: number;
  skill: string | null;
}

export interface DialogTopic {
  id: string;
  title: string;
  jun: string[];
  mid: string[];
  sen: string[];
}

export function TopicQuestionsDialog({
  topic,
  focusSkill,
  oftenAsked = 3,
  onClose,
}: {
  topic: DialogTopic | null;
  focusSkill?: string | null;
  oftenAsked?: number;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [band, setBand] = useState<Band | "all">("all");
  const [kind, setKind] = useState<"all" | "THEORY" | "EXPERIENCE">("all");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const topicId = topic?.id;

  useEffect(() => {
    if (!topicId) return;
    setQuestions(null);
    setBand("all");
    setKind("all");
    const controller = new AbortController();
    fetch(`/api/tech-matrix/topics/${encodeURIComponent(topicId)}/questions?limit=300`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { questions: Question[] } | null) => setQuestions(d?.questions ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [topicId]);

  // Which band each skill belongs to, so a skill group can show its level.
  const skillBand = useMemo(() => {
    const m = new Map<string, Band>();
    if (topic) for (const b of BANDS) for (const s of topic[b]) if (!m.has(s)) m.set(s, b);
    return m;
  }, [topic]);

  const visible = useMemo(() => {
    return (questions ?? []).filter((x) => {
      if (kind !== "all" && x.kind !== kind) return false;
      if (band !== "all") {
        const b = (x.skill && skillBand.get(x.skill)) || x.band;
        if (b !== band) return false;
      }
      return true;
    });
  }, [questions, kind, band, skillBand]);

  // Groups in matrix order (Junior → Senior skills), then the unmapped ones.
  const groups = useMemo(() => {
    const bySkill = new Map<string, Question[]>();
    const other: Question[] = [];
    for (const x of visible) {
      if (x.skill && skillBand.has(x.skill)) {
        const list = bySkill.get(x.skill) ?? [];
        list.push(x);
        bySkill.set(x.skill, list);
      } else other.push(x);
    }
    const ordered = [...skillBand.keys()]
      .filter((s) => bySkill.has(s))
      .map((s) => ({ skill: s as string | null, band: skillBand.get(s)!, items: bySkill.get(s)!, asked: bySkill.get(s)!.reduce((a, x) => a + x.timesAsked, 0) }));
    if (other.length) ordered.push({ skill: null, band: "jun", items: other, asked: other.reduce((a, x) => a + x.timesAsked, 0) });
    return ordered;
  }, [visible, skillBand]);

  // Scroll the dialog itself to the clicked skill once it has opened: the
  // dialog moves focus to its first control on open, which resets the scroll.
  useEffect(() => {
    if (!questions || !focusSkill) return;
    const t = setTimeout(() => {
      const el = focusRef.current;
      const box = el?.closest<HTMLElement>("[role=dialog]");
      if (el && box) box.scrollTo({ top: el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 12 });
    }, 400);
    return () => clearTimeout(t);
  }, [questions, focusSkill]);

  const total = questions?.length ?? 0;
  const pill = (active: boolean) =>
    cn("rounded-full border px-2.5 py-0.5 text-xs", active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted");

  return (
    <Dialog open={topic !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        {topic && (
          <>
            <DialogHeader>
              <DialogTitle>{topic.title} — asked at client interviews</DialogTitle>
              <DialogDescription>
                {questions === null ? "Loading…" : `${total} question${total === 1 ? "" : "s"}, grouped by the skill they test. Most asked first.`}
              </DialogDescription>
            </DialogHeader>

            {total > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {BANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={band === b}
                    className={pill(band === b)}
                    onClick={() => setBand((cur) => (cur === b ? "all" : b))}
                  >
                    {BAND_LABEL[b]}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                {(["THEORY", "EXPERIENCE"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    className={pill(kind === k)}
                    onClick={() => setKind((cur) => (cur === k ? "all" : k))}
                  >
                    {k === "THEORY" ? "Theory" : "Your experience"}
                  </button>
                ))}
                {(band !== "all" || kind !== "all") && (
                  <button
                    type="button"
                    className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => {
                      setBand("all");
                      setKind("all");
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            {questions !== null && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">{total ? "Nothing matches the filters." : "No interview questions for this topic yet."}</p>
            )}

            <div className="space-y-3">
              {groups.map((g) => {
                const heat = g.skill ? heatOf(g.asked, oftenAsked) : null;
                const focused = !!focusSkill && g.skill === focusSkill;
                return (
                  <section
                    key={g.skill ?? "__other"}
                    ref={focused ? focusRef : undefined}
                    className={cn("scroll-mt-2 rounded-xl border p-3", focused ? "border-primary/40 bg-primary/5" : "bg-card")}
                  >
                    <header className="mb-2 flex flex-wrap items-center gap-2">
                      {g.skill ? (
                        <>
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", BAND_DOT[g.band])} />
                          <span className={cn("rounded px-1.5 py-0.5 text-sm font-medium", heat ? HEAT_CLASS[heat] : "bg-muted")}>{g.skill}</span>
                          <span className="text-xs text-muted-foreground">
                            {BAND_LABEL[g.band]} · asked {g.asked}×
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">Other questions on this topic</span>
                      )}
                    </header>
                    <ul className="divide-y divide-border/60">
                      {g.items.map((x) => (
                        <li key={x.id} className="flex items-start justify-between gap-3 py-1.5 text-[13px] leading-snug">
                          <span className="min-w-0">
                            {x.text}
                            {x.kind === "EXPERIENCE" && (
                              <span className="ml-1.5 whitespace-nowrap text-[11px] text-muted-foreground">about your experience</span>
                            )}
                          </span>
                          {x.timesAsked > 1 && (
                            <span
                              className="mt-px shrink-0 rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground"
                              title={`Asked ${x.timesAsked} times`}
                            >
                              {x.timesAsked}×
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
