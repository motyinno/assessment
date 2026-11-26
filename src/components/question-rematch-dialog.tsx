"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

/**
 * Start an AI re-match of the bank against the current matrix
 * (lib/question-bank.ts startRematch): find questions for topics that were
 * added after the questions came in, or re-run matching for the unattached
 * ones. Topics added in the last 30 days come first and preselected when
 * they have no questions yet.
 */

export interface RematchTopic {
  id: string;
  title: string;
  sectionTitle: string;
  createdAt: string | null;
  total: number;
}

const NEW_DAYS = 30;

export function QuestionRematchDialog({
  open,
  onClose,
  divisionId,
  topics,
  counts,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  divisionId: string;
  topics: RematchTopic[];
  counts: { unattached: number; technical: number; batch: number };
  onStarted: (total: number) => void;
}) {
  const isNew = (t: RematchTopic) => !!t.createdAt && Date.now() - new Date(t.createdAt).getTime() < NEW_DAYS * 86_400_000;
  const [mode, setMode] = useState<"topics" | "unattached">("topics");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("topics");
    setError(null);
    setPicked(new Set(topics.filter((t) => isNew(t) && t.total === 0).map((t) => t.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const recent = useMemo(() => topics.filter(isNew), [topics]);
  const sections = useMemo(() => {
    const m = new Map<string, RematchTopic[]>();
    for (const t of topics) m.set(t.sectionTitle, [...(m.get(t.sectionTitle) ?? []), t]);
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics]);

  const checked = mode === "topics" ? counts.technical : counts.unattached;
  const calls = Math.max(1, Math.ceil(checked / counts.batch));
  const canStart = mode === "unattached" ? counts.unattached > 0 : picked.size > 0 && counts.technical > 0;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/interview-questions/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: divisionId, topicIds: mode === "topics" ? [...picked] : [] }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(apiErrorMessage(d, "Couldn't start the re-match"));
        return;
      }
      onStarted(d.total);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const row = (t: RematchTopic) => (
    <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60">
      <input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} />
      <span className="min-w-0 flex-1 truncate">{t.title}</span>
      {isNew(t) && <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium leading-4 text-primary">new</span>}
      <span className="w-20 text-right font-mono text-xs text-muted-foreground">{t.total ? `${t.total} q` : "no questions"}</span>
    </label>
  );

  const option = (value: typeof mode, title: string, note: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={cn("flex-1 rounded-xl border p-3 text-left", mode === value ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Re-match questions with AI</DialogTitle>
          <DialogDescription>
            Questions are matched to the matrix as it was when they came in. After you add topics, let the AI move the questions that
            belong there.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          {option("topics", "Find questions for topics", `Checks all ${counts.technical} technical questions against the topics you pick.`)}
          {option("unattached", "Questions not in the matrix", `Matches the ${counts.unattached} unattached questions to the whole matrix again.`)}
        </div>

        {mode === "topics" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              A question moves only when it fits a picked topic better than where it is now. Everything moved can be undone.
            </p>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border p-2">
              {recent.length > 0 && (
                <div>
                  <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Added in the last {NEW_DAYS} days</div>
                  {recent.map(row)}
                </div>
              )}
              {sections.map(([section, list]) => (
                <div key={section}>
                  <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{section}</div>
                  {list.map(row)}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {canStart ? `${checked} questions · about ${calls} AI call${calls === 1 ? "" : "s"}, runs in the background` : mode === "topics" ? "Pick at least one topic" : "Nothing to re-match"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canStart || busy} onClick={start}>
              {busy ? "Starting…" : mode === "topics" ? `Find questions${picked.size ? ` for ${picked.size}` : ""}` : "Re-match"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
