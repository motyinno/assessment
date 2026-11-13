"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, ChevronDown, Code2, Compass, ExternalLink, Flag, Flame, History, Loader2, Sparkles, Users, MessageSquare, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelfCheckDialog, SelfCheckScore } from "@/components/self-check-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { BAND_LABELS } from "@/lib/roadmap-types";
import { SELF_CHECK_PASS, type SelfCheckLanguage } from "@/lib/self-check";
import type { CoachState, MissionOption, MissionPlan, MissionReason, MissionView, PastMission } from "@/lib/mission";
import type { Grade } from "@/lib/types";
import { cn } from "@/lib/utils";

function reasonText(r: MissionReason, band: Grade): { icon: React.ReactNode; text: string } {
  switch (r.kind) {
    case "gap":
      return { icon: <Target />, text: r.resolved ? `${r.resolved} of ${r.total} skills on your roadmap` : `${r.total} skills not started on your roadmap` };
    case "struggle":
      return { icon: <Users />, text: `${r.weak} of ${r.assessed} people in your division stumbled here at ${BAND_LABELS[band]} assessments` };
    case "pdp":
      return { icon: <Compass />, text: "A goal of your development plan" };
    case "asked":
      return { icon: <MessageSquare />, text: `Clients asked about it ${r.times}×` };
  }
}

function Reasons({ reasons, band, className }: { reasons: MissionReason[]; band: Grade; className?: string }) {
  if (!reasons.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {reasons.map((r) => {
        const { icon, text } = reasonText(r, band);
        return (
          <li
            key={r.kind}
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0"
          >
            {icon}
            {text}
          </li>
        );
      })}
    </ul>
  );
}

function LanguageToggle({ value, onChange }: { value: SelfCheckLanguage; onChange: (l: SelfCheckLanguage) => void }) {
  return (
    <div className="flex rounded-lg border p-0.5 text-xs">
      {(["ru", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          className={cn(
            "rounded-md px-2.5 py-1 font-medium",
            value === l ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l === "ru" ? "Русский" : "English"}
        </button>
      ))}
    </div>
  );
}

/** Ticked plan steps live in the browser: they're the person's own notes, not progress anyone tracks. */
function useStepTicks(missionId: string) {
  const key = `mission-steps:${missionId}`;
  const [ticked, setTicked] = useState<number[]>([]);
  useEffect(() => {
    try {
      setTicked(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      setTicked([]);
    }
  }, [key]);
  const toggle = (i: number) =>
    setTicked((t) => {
      const next = t.includes(i) ? t.filter((x) => x !== i) : [...t, i];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable: keep it for this visit only
      }
      return next;
    });
  return { ticked, toggle };
}

async function send(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), "Something went wrong"));
}

/**
 * The tech coach: one roadmap topic a week, picked from the person's gaps,
 * where their division stumbles at assessments, their PDP and client demand.
 * `compact` is the dashboard teaser; the climb page shows the whole mission.
 */
export function MissionCard({ state, compact = false, className }: { state: CoachState; compact?: boolean; className?: string }) {
  const router = useRouter();
  if (!state.available) return null;
  const { mission, options, streak, done, history } = state;

  return (
    <Card id="mission" className={cn("scroll-mt-6", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Compass className="size-4 text-trail" /> Mission of the week
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            One topic for {state.targetGradeLabel}, a plan for a few evenings, and a check at the end.
          </p>
        </div>
        {(streak > 0 || done > 0) && (
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
            {streak > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-trail/10 px-2 py-0.5 font-medium text-trail">
                <Flame className="size-3.5" /> {streak} weeks in a row
              </span>
            )}
            {done > 0 && <span className="tabular-nums">{done} done</span>}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {mission?.status === "ACTIVE" ? (
          compact ? (
            <ActiveTeaser mission={mission} />
          ) : (
            <ActiveMission mission={mission} onChanged={() => router.refresh()} />
          )
        ) : (
          <div className="space-y-5">
            {mission?.status === "DONE" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 px-4 py-3">
                <p className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-success" />
                  <span>
                    This week&apos;s mission is done: <b>{mission.topicTitle}</b>
                  </span>
                </p>
                {mission.checkScore !== null && <SelfCheckScore score={mission.checkScore} />}
              </div>
            )}
            <Options
              options={options}
              compact={compact}
              title={mission?.status === "DONE" ? "Up for one more?" : null}
              onStarted={() => router.refresh()}
            />
          </div>
        )}
        {!compact && history.length > 0 && <PastMissions missions={history} />}
      </CardContent>
    </Card>
  );
}

function Options({
  options,
  compact,
  title,
  onStarted,
}: {
  options: MissionOption[];
  compact: boolean;
  title: string | null;
  onStarted: () => void;
}) {
  const [picked, setPicked] = useState(0);
  const [language, setLanguage] = useState<SelfCheckLanguage>("ru");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options.length) {
    return <p className="text-sm text-muted-foreground">Every topic of this grade is covered on your roadmap. Nothing to coach here.</p>;
  }
  const option = options[Math.min(picked, options.length - 1)];

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await send("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: option.topicId, language }),
      });
      onStarted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {title && <p className="text-sm font-medium">{title}</p>}
      <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{option.section}</p>
          <p className="font-display text-lg font-bold leading-snug">{option.topicTitle}</p>
        </div>
        <Reasons reasons={option.reasons} band={option.band} />
        {!compact && option.skills.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">You&apos;ll work on</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {option.skills.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button onClick={start} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy ? "Preparing your plan…" : "Start this mission"}
          </Button>
          {!compact && <LanguageToggle value={language} onChange={setLanguage} />}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {options.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Or pick another topic</p>
          <div className="flex flex-wrap gap-2">
            {options.map((o, i) =>
              i === picked ? null : (
                <button
                  key={o.topicId}
                  type="button"
                  onClick={() => setPicked(i)}
                  disabled={busy}
                  className="rounded-lg border px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  {o.topicTitle}
                  <span className="ml-1.5 text-xs text-muted-foreground">{o.section}</span>
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActiveTeaser({ mission }: { mission: MissionView }) {
  const { ticked } = useStepTicks(mission.id);
  const total = mission.plan.steps.length;
  return (
    <div className="space-y-3">
      <div>
        <p className="font-display text-lg font-bold leading-snug">{mission.topicTitle}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mission.plan.summary}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-trail transition-all" style={{ width: `${total ? (ticked.length / total) * 100 : 0}%` }} />
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {ticked.length}/{total} steps
        </span>
        {mission.checkScore !== null && <SelfCheckScore score={mission.checkScore} />}
      </div>
      <Link href="/climb#mission" className="inline-block text-sm font-medium text-primary hover:underline">
        Open the mission →
      </Link>
    </div>
  );
}

function ActiveMission({ mission, onChanged }: { mission: MissionView; onChanged: () => void }) {
  const { ticked, toggle } = useStepTicks(mission.id);
  const [checking, setChecking] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(false);
  const { plan } = mission;
  const planDone = plan.steps.length > 0 && plan.steps.every((_, i) => ticked.includes(i));
  const failed = mission.checkScore !== null && mission.checkScore < SELF_CHECK_PASS;

  async function drop() {
    if (!confirm("Drop this mission? The coach will offer other topics.")) return;
    setDropping(true);
    setError(null);
    try {
      await send(`/api/missions/${mission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drop" }),
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
      setDropping(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-display text-xl font-bold leading-snug">{mission.topicTitle}</p>
        <Reasons reasons={mission.reasons} band={mission.band} />
        <p className="max-w-3xl text-sm text-muted-foreground">{plan.summary}</p>
      </div>

      <PlanBody plan={plan} ticked={ticked} onToggle={toggle} />

      {/* The only way to finish: the plan's ticks are the person's own notes, the check is the proof. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-xl border p-4 transition-colors",
          planDone ? "border-primary/50 bg-primary/5" : "border-dashed"
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            planDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          <Flag className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-semibold">
            {planDone ? "Plan done — last step: the check" : "Finish line: the check"}
          </p>
          <p className="text-sm text-muted-foreground">
            {failed
              ? `Your last try scored ${mission.checkScore}%. You need ${SELF_CHECK_PASS}% — revisit the steps you missed and try again.`
              : `Six questions, about ten minutes. ${SELF_CHECK_PASS}% or more completes the mission and ticks the skills you get right on your roadmap.`}
          </p>
        </div>
        <Button onClick={() => setChecking(true)} variant={planDone || failed ? "default" : "outline"}>
          <Sparkles /> {failed ? "Try again" : "Take the check"}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={drop} disabled={dropping}>
          Drop mission
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {checking && (
        <SelfCheckDialog
          url={`/api/missions/${mission.id}/self-check`}
          title={mission.topicTitle}
          subject="mission"
          onClose={() => {
            setChecking(false);
            if (changed.current) onChanged();
            changed.current = false;
          }}
          onScored={() => {
            changed.current = true;
          }}
          onTicked={() => {
            changed.current = true;
          }}
        />
      )}
    </div>
  );
}

/** The study plan: steps, the hands-on task and links. Steps tick only where `onToggle` is given. */
function PlanBody({ plan, ticked = [], onToggle }: { plan: MissionPlan; ticked?: number[]; onToggle?: (i: number) => void }) {
  return (
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Plan · about {Math.round(plan.steps.reduce((sum, x) => sum + x.minutes, 0) / 30) / 2} h
          </p>
          <ol className="space-y-2">
            {plan.steps.map((step, i) => {
              const isDone = ticked.includes(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={onToggle ? () => onToggle(i) : undefined}
                    disabled={!onToggle}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      onToggle && "hover:bg-muted/40",
                      isDone && "bg-muted/30"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                        isDone ? "border-trail bg-trail text-white" : "border-input"
                      )}
                    >
                      {isDone && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className={cn("flex items-center gap-1.5 text-sm font-medium", isDone && "text-muted-foreground line-through")}>
                        {step.kind === "practice" ? (
                          <Code2 className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <BookOpen className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {step.title}
                      </span>
                      {step.detail && <span className="block text-sm text-muted-foreground">{step.detail}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{step.minutes}m</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-trail/40 bg-trail/5 p-4">
            <p className="text-xs font-medium text-muted-foreground">Hands-on task</p>
            <p className="text-sm font-semibold">{plan.task.title}</p>
            <p className="text-sm text-muted-foreground">{plan.task.description}</p>
            {plan.task.doneWhen.length > 0 && (
              <ul className="space-y-1 pt-1">
                {plan.task.doneWhen.map((c) => (
                  <li key={c} className="flex items-start gap-1.5 text-sm">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-trail" />
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {plan.resources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Read</p>
              <ul className="space-y-1">
                {plan.resources.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {r.label} <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmt = (iso: string) => dateFmt.format(new Date(iso));

/** Every mission the person finished or dropped, newest first; each opens its saved plan. */
function PastMissions({ missions }: { missions: PastMission[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<PastMission | null>(null);
  return (
    <div className="mt-6 border-t pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <History className="size-4" /> Past missions
        <span className="font-mono text-xs tabular-nums">{missions.length}</span>
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="mt-3 divide-y rounded-xl border">
          {missions.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setShown(m)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <StatusPill status={m.status} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.topicTitle}</span>
                <span className="text-xs text-muted-foreground">
                  {BAND_LABELS[m.band]} · {fmt(m.completedAt ?? m.createdAt)}
                </span>
                {m.checkScore !== null && <SelfCheckScore score={m.checkScore} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown && <PastMissionDialog mission={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

function StatusPill({ status }: { status: MissionView["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "DONE" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
      )}
    >
      {status === "DONE" ? "Done" : "Dropped"}
    </span>
  );
}

function PastMissionDialog({ mission, onClose }: { mission: PastMission; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mission.topicTitle} <StatusPill status={mission.status} />
          </DialogTitle>
          <DialogDescription>
            {BAND_LABELS[mission.band]} · started {fmt(mission.createdAt)}
            {mission.completedAt && ` · done ${fmt(mission.completedAt)}`}
            {mission.checkScore !== null && ` · last check ${mission.checkScore}%`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Reasons reasons={mission.reasons} band={mission.band} />
          <p className="text-sm text-muted-foreground">{mission.plan.summary}</p>
          <PlanBody plan={mission.plan} />
          {mission.offeredAgainFrom && (
            <p className="text-xs text-muted-foreground">
              The coach won&apos;t offer this topic again until {fmt(mission.offeredAgainFrom)}.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
