"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Lock, RotateCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import {
  SELF_CHECK_PASS,
  type SelfCheckAnswer,
  type SelfCheckLanguage,
  type SelfCheckQuestion,
  type SelfCheckVerdict,
  type SelfCheckView,
  type Verdict,
} from "@/lib/self-check";
import { cn } from "@/lib/utils";

const VERDICT_META: Record<Verdict, { label: string; className: string }> = {
  correct: { label: "Right", className: "bg-success/15 text-success" },
  partial: { label: "Partly", className: "bg-warning/20 text-warning-foreground dark:text-warning" },
  wrong: { label: "Missed", className: "bg-destructive/10 text-destructive" },
};

async function call(url: string, init?: RequestInit): Promise<SelfCheckView | null> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(apiErrorMessage(body, "Something went wrong"));
  return body as SelfCheckView | null;
}

/** Score chip for a goal: the latest attempt's result. */
export function SelfCheckScore({ score, className }: { score: number; className?: string }) {
  const passed = score >= SELF_CHECK_PASS;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
        passed ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        className
      )}
      title="Your latest self-check — only you see it"
    >
      {passed && <Check className="size-3" />}
      Checked {score}%
    </span>
  );
}

/**
 * "Check yourself" for one PDP goal: a button that opens a short AI quiz.
 * Private to the employee. Reports a new score through onScored.
 */
export function SelfCheckButton({
  pdpId,
  goalId,
  goalTitle,
  onScored,
  size = "xs",
}: {
  pdpId: string;
  goalId: string;
  goalTitle: string;
  onScored?: (score: number) => void;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // A new score or roadmap ticks change server-rendered pages (the climb):
  // refresh them once the dialog closes, not under the user's feet.
  const changed = useRef(false);
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        <Sparkles /> Check yourself
      </Button>
      {open && (
        <SelfCheckDialog
          url={`/api/pdps/${pdpId}/goals/${goalId}/self-check`}
          title={goalTitle}
          onClose={() => {
            setOpen(false);
            if (changed.current) router.refresh();
            changed.current = false;
          }}
          onScored={(score) => {
            changed.current = true;
            onScored?.(score);
          }}
          onTicked={() => {
            changed.current = true;
          }}
        />
      )}
    </>
  );
}

/**
 * The quiz itself. `url` is the attempts collection of whatever is being
 * checked — a PDP goal or a tech-coach mission; both APIs have the same shape.
 */
export function SelfCheckDialog({
  url,
  title,
  subject = "goal",
  onClose,
  onScored,
  onTicked,
}: {
  url: string;
  title: string;
  subject?: "goal" | "mission";
  onClose: () => void;
  onScored?: (score: number) => void;
  onTicked?: () => void;
}) {
  const [check, setCheck] = useState<SelfCheckView | null>(null);
  const [phase, setPhase] = useState<"loading" | "intro" | "generating" | "answering" | "grading" | "result">("loading");
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<SelfCheckLanguage>("ru");
  const [answers, setAnswers] = useState<Record<string, SelfCheckAnswer>>({});
  const [ticked, setTicked] = useState<string[]>([]);

  const show = useCallback((c: SelfCheckView | null) => {
    setCheck(c);
    setAnswers({});
    setPhase(!c ? "intro" : c.submittedAt ? "result" : "answering");
  }, []);

  useEffect(() => {
    call(url)
      .then(show)
      .catch((e: Error) => {
        setError(e.message);
        setPhase("intro");
      });
  }, [url, show]);

  async function start() {
    setError(null);
    setPhase("generating");
    try {
      show(
        await call(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language }),
        })
      );
      setTicked([]);
    } catch (e) {
      setError((e as Error).message);
      setPhase("intro");
    }
  }

  async function submit() {
    if (!check) return;
    setError(null);
    setPhase("grading");
    try {
      const result = await call(`${url}/${check.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: Object.values(answers) }),
      });
      show(result);
      if (result?.score != null) onScored?.(result.score);
      if (result?.ticked?.length) {
        setTicked(result.ticked);
        onTicked?.();
      }
    } catch (e) {
      setError((e as Error).message);
      setPhase("answering");
    }
  }

  const set = (questionId: string, patch: Partial<SelfCheckAnswer>) =>
    setAnswers((a) => ({ ...a, [questionId]: { ...a[questionId], questionId, ...patch } }));

  const unanswered = check
    ? check.questions.filter((q) => {
        const a = answers[q.id];
        return q.kind === "choice" ? a?.choice === undefined : !a?.text?.trim();
      }).length
    : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check yourself</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        {phase === "loading" && <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />}

        {phase === "intro" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Six questions on this {subject}: four with options and two to answer in your own words. Takes about ten
              minutes. The AI checks your answers and tells you what to revisit.
              {subject === "mission"
                ? ` Score ${SELF_CHECK_PASS}% or more to complete the mission — the skills you get right are ticked on your roadmap.`
                : " It's practice for you — your roadmap moves when your manager closes the PDP."}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Only you see your answers and score — not your manager, not admins.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border p-0.5 text-xs">
                {(["ru", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium",
                      language === l ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {l === "ru" ? "Русский" : "English"}
                  </button>
                ))}
              </div>
              <Button onClick={start}>
                <Sparkles /> Start
              </Button>
            </div>
          </div>
        )}

        {(phase === "generating" || phase === "grading") && (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            {phase === "generating" ? "Preparing your questions…" : "Checking your answers…"}
          </div>
        )}

        {phase === "answering" && check && (
          <div className="space-y-5">
            {check.questions.map((q, i) => (
              <fieldset key={q.id} className="space-y-2">
                <legend className="mb-2 text-sm font-medium whitespace-pre-line">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  {q.text}
                </legend>
                {q.kind === "choice" ? (
                  <div className="grid gap-1.5">
                    {q.options.map((o, oi) => {
                      const chosen = answers[q.id]?.choice === oi;
                      return (
                        <button
                          key={oi}
                          type="button"
                          onClick={() => set(q.id, { choice: oi })}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            chosen ? "border-primary bg-primary/5" : "hover:bg-muted/60"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 size-4 shrink-0 rounded-full border",
                              chosen ? "border-[5px] border-primary" : "border-input"
                            )}
                          />
                          <span className="whitespace-pre-line">{o}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    value={answers[q.id]?.text ?? ""}
                    onChange={(e) => set(q.id, { text: e.target.value })}
                    rows={4}
                    maxLength={4000}
                    placeholder="Your answer, in your own words"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                )}
              </fieldset>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              {unanswered > 0 && (
                <span className="text-xs text-muted-foreground">
                  {unanswered} unanswered — they count as missed
                </span>
              )}
              <Button onClick={submit}>Check my answers</Button>
            </div>
          </div>
        )}

        {phase === "result" && check && (
          <Result check={check} subject={subject} ticked={ticked} onRetry={() => setPhase("intro")} error={error} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Result({
  check,
  subject,
  ticked,
  onRetry,
  error,
}: {
  check: SelfCheckView;
  subject: "goal" | "mission";
  ticked: string[];
  onRetry: () => void;
  error: string | null;
}) {
  const verdicts = new Map((check.verdicts ?? []).map((v: SelfCheckVerdict) => [v.questionId, v]));
  const answers = new Map((check.answers ?? []).map((a) => [a.questionId, a]));
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium">
            {check.passed ? (subject === "mission" ? "Mission complete — well climbed." : "Solid — you've got this goal.") : "Not there yet — worth another pass over the material."}
          </p>
          <p className="text-xs text-muted-foreground">
            {check.passed ? `${SELF_CHECK_PASS}% or more counts as passed.` : `You need ${SELF_CHECK_PASS}% to pass. Review the notes below and try again.`}
          </p>
        </div>
        <p className={cn("font-display text-3xl font-extrabold tabular-nums", check.passed ? "text-success" : "text-foreground")}>
          {check.score}%
        </p>
      </div>

      {ticked.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-xl border border-trail/40 bg-trail/5 px-4 py-3 text-sm">
          <Check className="size-4 shrink-0 text-success" /> Ticked on your roadmap: {ticked.join(", ")}
        </p>
      )}

      <ol className="space-y-4">
        {(check.questions as SelfCheckQuestion[]).map((q, i) => {
          const v = verdicts.get(q.id);
          const a = answers.get(q.id);
          const meta = v ? VERDICT_META[v.verdict] : null;
          return (
            <li key={q.id} className="space-y-2 rounded-xl border px-4 py-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-medium whitespace-pre-line">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  {q.text}
                </p>
                {meta && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.className)}>{meta.label}</span>}
              </div>
              {q.kind === "choice" ? (
                <div className="grid gap-1">
                  {q.options.map((o, oi) => {
                    const right = oi === q.correct;
                    const mine = a?.choice === oi;
                    if (!right && !mine) return null;
                    return (
                      <p key={oi} className={cn("flex items-start gap-1.5 text-sm", right ? "text-success" : "text-destructive")}>
                        {right ? <Check className="mt-0.5 size-3.5 shrink-0" /> : <X className="mt-0.5 size-3.5 shrink-0" />}
                        <span className="whitespace-pre-line">
                          {o}
                          {mine && !right && <span className="text-xs text-muted-foreground"> · your answer</span>}
                        </span>
                      </p>
                    );
                  })}
                </div>
              ) : (
                a?.text?.trim() && (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm whitespace-pre-line text-muted-foreground">{a.text}</p>
                )
              )}
              {v?.feedback && <p className="text-sm text-muted-foreground">{v.feedback}</p>}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end border-t pt-4">
        <Button variant="outline" onClick={onRetry}>
          <RotateCw /> New questions
        </Button>
      </div>
    </div>
  );
}
