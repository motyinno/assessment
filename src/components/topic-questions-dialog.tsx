"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [q, setQ] = useState("");
  const focusRef = useRef<HTMLDivElement | null>(null);
  const topicId = topic?.id;

  useEffect(() => {
    if (!topicId) return;
    setQuestions(null);
    setBand("all");
    setKind("all");
    setQ("");
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
    const needle = q.trim().toLowerCase();
    return (questions ?? []).filter((x) => {
      if (kind !== "all" && x.kind !== kind) return false;
      if (band !== "all") {
        const b = (x.skill && skillBand.get(x.skill)) || x.band;
        if (b !== band) return false;
      }
      return !needle || x.text.toLowerCase().includes(needle);
    });
  }, [questions, kind, band, q, skillBand]);

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

  useEffect(() => {
    if (questions && focusSkill) focusRef.current?.scrollIntoView({ block: "start" });
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
                <Input className="h-8 w-48" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
                {(["all", ...BANDS] as const).map((b) => (
                  <button key={b} type="button" className={pill(band === b)} onClick={() => setBand(b)}>
                    {b === "all" ? "All levels" : BAND_LABEL[b]}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-border" />
                {(["all", "THEORY", "EXPERIENCE"] as const).map((k) => (
                  <button key={k} type="button" className={pill(kind === k)} onClick={() => setKind(k)}>
                    {k === "all" ? "All" : k === "THEORY" ? "Theory" : "Your experience"}
                  </button>
                ))}
              </div>
            )}

            {questions !== null && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">{total ? "Nothing matches the filters." : "No interview questions for this topic yet."}</p>
            )}

            <div className="space-y-4">
              {groups.map((g) => {
                const heat = g.skill ? heatOf(g.asked, oftenAsked) : null;
                const focused = !!focusSkill && g.skill === focusSkill;
                return (
                  <div key={g.skill ?? "__other"} ref={focused ? focusRef : undefined} className={cn("space-y-1.5 rounded-lg", focused && "ring-2 ring-primary/40 p-2 -m-2")}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {g.skill ? (
                        <>
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", BAND_DOT[g.band])} />
                          <span className={cn("rounded-sm px-1", heat && HEAT_CLASS[heat])}>{g.skill}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {BAND_LABEL[g.band]} · asked {g.asked}×
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Other questions on this topic</span>
                      )}
                    </div>
                    <ul className="space-y-1 pl-4">
                      {g.items.map((x) => (
                        <li key={x.id} className="flex items-start gap-2 text-[13px] leading-relaxed">
                          <span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                          <span className="flex-1">
                            {x.text}
                            <span className="ml-1.5 whitespace-nowrap text-[11px] text-muted-foreground">
                              {x.kind === "EXPERIENCE" ? "· about your experience" : ""}
                              {x.timesAsked > 1 ? ` · asked ${x.timesAsked}×` : ""}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
