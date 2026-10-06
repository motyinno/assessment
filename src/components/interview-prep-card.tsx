"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Code2, EyeOff, ListChecks, Loader2, Plus, RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import type {
  InterviewPrepContent,
  PrepLanguage,
  PrepQuestion,
  PrepReason,
  PrepTopic,
  TopicSignals,
} from "@/lib/interview-prep";

interface PickerTopic {
  id: string;
  title: string;
  signals: TopicSignals;
}

interface PickerSection {
  id: string;
  title: string;
  topics: PickerTopic[];
}

interface SavedPrep {
  language: PrepLanguage;
  topicIds: string[];
  content: InterviewPrepContent;
  status: "READY" | "GENERATING" | "FAILED";
  error: string | null;
  pendingTopicIds: string[];
  updatedAt: string;
}

interface PrepResponse {
  targetGradeLabel: string;
  assessmentType: string;
  maxTopics: number;
  sections: PickerSection[];
  defaultTopicIds: string[];
  prep: SavedPrep | null;
}

const REASON_LABELS: Record<PrepReason, string> = {
  past_gap: "Previous gap",
  pdp: "PDP",
  self_check: "Check self-rating",
  coverage: "",
};

const REASON_VARIANTS: Record<PrepReason, "destructive" | "info" | "warning" | "secondary"> = {
  past_gap: "destructive",
  pdp: "info",
  self_check: "warning",
  coverage: "secondary",
};

const POLL_MS = 3000;

const LANGUAGE_LABELS: Record<PrepLanguage, string> = { ru: "Русский", en: "English" };

const PDP_SECTION_ID = "__pdp__";

function SignalBadges({ signals }: { signals: TopicSignals }) {
  return (
    <>
      {signals.pastScore !== null && (
        <Badge variant={signals.pastScore <= 6 ? "destructive" : "secondary"}>
          Last time {signals.pastScore}/10
        </Badge>
      )}
      {signals.inPdp && <Badge variant="info">In PDP</Badge>}
      {signals.selfScore !== null && <Badge variant="outline">Self {signals.selfScore}/10</Badge>}
    </>
  );
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await res.json().catch(() => null), fallback);
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * AI-prepared interview questions for the assessor running this assessment.
 * Private to that assessor — the API refuses everyone else, the subject included.
 */
export function InterviewPrepCard({ assessmentId }: { assessmentId: string }) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<PrepResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [language, setLanguage] = useState<PrepLanguage>("ru");
  const [submitting, setSubmitting] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [topicBusy, setTopicBusy] = useState<string | null>(null);
  const [topicError, setTopicError] = useState<{ topicId: string; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assessments/${assessmentId}/interview-prep`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await errorFrom(r, "Couldn't load interview prep"));
        return r.json() as Promise<PrepResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const prep = data?.prep ?? null;
  const generating = submitting || prep?.status === "GENERATING";

  // Generation runs in the background on the server; poll until it settles.
  useEffect(() => {
    if (prep?.status !== "GENERATING") return;
    const timer = setInterval(async () => {
      const r = await fetch(`/api/assessments/${assessmentId}/interview-prep`).catch(() => null);
      if (!r?.ok) return;
      const d = (await r.json()) as PrepResponse;
      setData((prev) => (prev ? { ...prev, prep: d.prep } : d));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [assessmentId, prep?.status]);
  const allQuestions = useMemo(() => prep?.content.topics.flatMap((t) => t.questions) ?? [], [prep]);
  const askedCount = allQuestions.filter((q) => q.asked).length;
  const sectionTitles = useMemo(
    () => Array.from(new Set(prep?.content.topics.map((t) => t.sectionTitle) ?? [])),
    [prep]
  );
  const topicTitles = useMemo(
    () => new Map((data?.sections ?? []).flatMap((s) => s.topics.map((t) => [t.id, t.title] as const))),
    [data?.sections]
  );
  const visibleTopics = prep?.content.topics.filter((t) => !sectionFilter || t.sectionTitle === sectionFilter) ?? [];

  function openPicker() {
    if (!data) return;
    setSelected(new Set(prep ? prep.topicIds : data.defaultTopicIds));
    setLanguage(prep?.language ?? "ru");
    setGenerateError(null);
    setPickerOpen(true);
  }

  function toggleTopic(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSection(section: PickerSection) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = section.topics.every((t) => next.has(t.id));
      for (const t of section.topics) {
        if (allOn) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  async function submitTopics(topicIds: string[], lang: PrepLanguage) {
    if (!data) return;
    setSubmitting(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/interview-prep`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicIds, language: lang }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't start generating questions"));
      const { prep: next } = (await res.json()) as { prep: SavedPrep };
      setData((prev) => (prev ? { ...prev, prep: next } : prev));
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function generate() {
    if (!data) return;
    // Keep the matrix order regardless of click order.
    const ordered = data.sections.flatMap((s) => s.topics.map((t) => t.id)).filter((id) => selected.has(id));
    // The dialog closes right away; questions arrive in the card when ready.
    setPickerOpen(false);
    setSectionFilter(null);
    setOpen(true);
    void submitTopics(ordered, language);
  }

  function updateTopic(topicId: string, fn: (t: PrepTopic) => PrepTopic) {
    setData((d) =>
      d && d.prep
        ? {
            ...d,
            prep: {
              ...d.prep,
              content: {
                ...d.prep.content,
                topics: d.prep.content.topics.map((t) => (t.topicId === topicId ? fn(t) : t)),
              },
            },
          }
        : d
    );
  }

  async function setAsked(topicId: string, q: PrepQuestion, asked: boolean) {
    const apply = (value: boolean) =>
      updateTopic(topicId, (t) => ({
        ...t,
        questions: t.questions.map((x) => (x.id === q.id ? { ...x, asked: value } : x)),
      }));
    apply(asked);
    const res = await fetch(`/api/assessments/${assessmentId}/interview-prep`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: q.id, asked }),
    }).catch(() => null);
    if (!res?.ok) apply(!asked);
  }

  async function extendTopic(topicId: string, action: "more" | "task") {
    setTopicBusy(`${topicId}:${action}`);
    setTopicError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/interview-prep/topic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, action }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't generate"));
      const { topic } = (await res.json()) as { topic: PrepTopic };
      updateTopic(topicId, () => topic);
    } catch (e) {
      setTopicError({ topicId, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTopicBusy(null);
    }
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const tooMany = data ? selected.size > data.maxTopics : false;
  const readyTopicIds = new Set(prep?.content.topics.map((t) => t.topicId) ?? []);
  // Topics the model will actually be asked about on submit.
  const newCount =
    prep && language === prep.language
      ? Array.from(selected).filter((id) => !readyTopicIds.has(id)).length
      : selected.size;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-6 py-4 hover:bg-muted/40 rounded-lg transition-colors"
      >
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
        <Sparkles className="size-4 text-primary" />
        <span className="text-base font-semibold">Interview prep</span>
        {generating ? (
          <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Generating questions…
          </span>
        ) : (
          prep && (
            <span className="text-xs text-muted-foreground ml-auto">
              {askedCount}/{allQuestions.length} asked · {LANGUAGE_LABELS[prep.language]} · {timeAgo(prep.updatedAt)}
            </span>
          )
        )}
      </button>

      {open && (
        <CardContent className="pt-0 space-y-4">
          {loadError && <p className="text-sm text-destructive">{loadError}</p>}
          {!data && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}

          {generateError && <p className="text-sm text-destructive">{generateError}</p>}

          {data && !prep && !submitting && (
            <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Pick the topics you&apos;ll cover and get questions for the {data.targetGradeLabel} level, with
                answer key points. They take into account previous assessments and the PDP.
              </p>
              <Button onClick={openPicker} disabled={data.sections.length === 0}>
                <ListChecks /> Choose topics
              </Button>
              {data.sections.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  The candidate&apos;s division has no tech matrix yet.
                </p>
              )}
            </div>
          )}

          {data && !prep && submitting && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Generating questions…
            </p>
          )}

          {data && prep && (
            <>
              {prep.content.focus && (
                <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
                  {prep.content.focus}
                </p>
              )}

              {prep.status === "FAILED" && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
                  <span className="text-destructive">{prep.error}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={submitting}
                    onClick={() => submitTopics(prep.topicIds, prep.language)}
                  >
                    <RotateCw /> Retry
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                {sectionTitles.length > 1 && (
                  <>
                    <Button
                      size="sm"
                      variant={sectionFilter === null ? "secondary" : "ghost"}
                      onClick={() => setSectionFilter(null)}
                    >
                      All
                    </Button>
                    {sectionTitles.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={sectionFilter === s ? "secondary" : "ghost"}
                        onClick={() => setSectionFilter(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </>
                )}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevealed(new Set())}
                    title="Collapse every answer — safe to share your screen"
                  >
                    <EyeOff /> Hide answers
                  </Button>
                  <Button size="sm" variant="outline" onClick={openPicker} disabled={generating}>
                    <ListChecks /> Change topics
                  </Button>
                </div>
              </div>

              <div className="space-y-5">
                {visibleTopics.map((topic) => {
                  const signals = data.sections
                    .flatMap((s) => s.topics)
                    .find((t) => t.id === topic.topicId)?.signals;
                  return (
                    <div key={topic.topicId} className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{topic.title}</span>
                        <span className="text-xs text-muted-foreground">{topic.sectionTitle}</span>
                        {signals && <SignalBadges signals={signals} />}
                      </div>

                      <div className="divide-y rounded-lg border">
                        {topic.questions.map((q) => {
                          const isOpen = revealed.has(q.id);
                          return (
                            <div key={q.id} className="flex gap-3 px-3 py-2.5">
                              <Checkbox
                                checked={q.asked}
                                onCheckedChange={(v) => setAsked(topic.topicId, q, v === true)}
                                aria-label="Asked"
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <p className={cn("text-sm", q.asked && "text-muted-foreground")}>{q.text}</p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {q.reason !== "coverage" && (
                                    <Badge variant={REASON_VARIANTS[q.reason]}>{REASON_LABELS[q.reason]}</Badge>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => toggleReveal(q.id)}
                                    className="text-xs text-primary hover:underline"
                                  >
                                    {isOpen ? "Hide key points" : "Key points"}
                                  </button>
                                </div>
                                {isOpen && (
                                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1.5">
                                    {q.keyPoints.length > 0 && (
                                      <ul className="list-disc pl-4 space-y-0.5">
                                        {q.keyPoints.map((k, i) => (
                                          <li key={i}>{k}</li>
                                        ))}
                                      </ul>
                                    )}
                                    {q.redFlags.length > 0 && (
                                      <div className="text-destructive">
                                        <span className="font-medium">Red flags: </span>
                                        {q.redFlags.join("; ")}
                                      </div>
                                    )}
                                    {q.followUp && (
                                      <div>
                                        <span className="font-medium">Follow-up: </span>
                                        {q.followUp}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {topic.task && (
                        <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm space-y-1">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Code2 className="size-4" /> {topic.task.title}
                          </div>
                          <p className="text-muted-foreground whitespace-pre-line">{topic.task.description}</p>
                          {topic.task.expectations.length > 0 && revealed.has(`task:${topic.topicId}`) && (
                            <ul className="list-disc pl-4 text-xs space-y-0.5">
                              {topic.task.expectations.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          )}
                          {topic.task.expectations.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleReveal(`task:${topic.topicId}`)}
                              className="text-xs text-primary hover:underline"
                            >
                              {revealed.has(`task:${topic.topicId}`) ? "Hide expectations" : "Expectations"}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={topicBusy !== null}
                          onClick={() => extendTopic(topic.topicId, "more")}
                        >
                          <Plus /> {topicBusy === `${topic.topicId}:more` ? "Generating…" : "More questions"}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={topicBusy !== null}
                          onClick={() => extendTopic(topic.topicId, "task")}
                        >
                          <Code2 />{" "}
                          {topicBusy === `${topic.topicId}:task`
                            ? "Generating…"
                            : topic.task
                              ? "Another task"
                              : "Practical task"}
                        </Button>
                        {topicError?.topicId === topic.topicId && (
                          <span className="text-xs text-destructive">{topicError.message}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {prep.status === "GENERATING" &&
                  !sectionFilter &&
                  prep.pendingTopicIds.map((id) => (
                    <div key={id} className="space-y-1">
                      <span className="text-sm font-semibold">{topicTitles.get(id) ?? id}</span>
                      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Generating questions…
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </CardContent>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>Choose interview topics</DialogTitle>
            <DialogDescription>
              Questions are for the {data?.targetGradeLabel} level. Topics with a previous gap or in the PDP are
              marked.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto -mx-4 px-4 space-y-4">
            {data?.sections.map((section) => {
              const onCount = section.topics.filter((t) => selected.has(t.id)).length;
              return (
                <div key={section.id} className="space-y-1">
                  <label className="flex items-center gap-2 py-1 cursor-pointer">
                    <Checkbox
                      checked={onCount === section.topics.length}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <span className="text-sm font-semibold">
                      {section.id === PDP_SECTION_ID ? "From the PDP (outside the matrix)" : section.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {onCount}/{section.topics.length}
                    </span>
                  </label>
                  <div className="pl-6 space-y-0.5">
                    {section.topics.map((t) => (
                      <label
                        key={t.id}
                        className="flex flex-wrap items-center gap-2 py-1 cursor-pointer rounded hover:bg-muted/40 px-1 -mx-1"
                      >
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleTopic(t.id)} />
                        <span className="text-sm">{t.title}</span>
                        {readyTopicIds.has(t.id) && language === prep?.language && (
                          <Badge variant="success">Has questions</Badge>
                        )}
                        <SignalBadges signals={t.signals} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Language</span>
              {(Object.keys(LANGUAGE_LABELS) as PrepLanguage[]).map((l) => (
                <Button
                  key={l}
                  size="sm"
                  variant={language === l ? "secondary" : "ghost"}
                  onClick={() => setLanguage(l)}
                >
                  {LANGUAGE_LABELS[l]}
                </Button>
              ))}
              <span className={cn("ml-auto text-sm", tooMany ? "text-destructive" : "text-muted-foreground")}>
                {selected.size}/{data?.maxTopics} topics
              </span>
            </div>
            {prep && (
              <p className="text-xs text-muted-foreground">
                {language === prep.language
                  ? "Topics that already have questions keep them. Only new topics are generated."
                  : "Changing the language regenerates questions for every topic."}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
              <Button onClick={generate} disabled={selected.size === 0 || tooMany}>
                <Sparkles /> {newCount > 0 ? `Generate questions (${newCount})` : "Save topics"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
