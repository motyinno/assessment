"use client";

import { useState } from "react";
import { Check, Code2, ExternalLink, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

export interface ProgressItem {
  id: string;
  type: "THEORY" | "PRACTICE";
  text: string;
  doneAt: string | null;
  link: string | null;
}

export interface ProgressGoal {
  id: string;
  title: string;
  items: ProgressItem[];
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await res.json().catch(() => null), fallback);
}

/**
 * A PDP as a checklist. The owner (the employee) ticks items and attaches
 * links to their work while the plan is active; everyone else sees progress.
 */
export function PdpProgressView({
  pdpId,
  goals,
  editable,
  onGoalsChange,
}: {
  pdpId: string;
  goals: ProgressGoal[];
  /** The employee on an active plan. */
  editable: boolean;
  onGoalsChange: (fn: (prev: ProgressGoal[]) => ProgressGoal[]) => void;
}) {
  const [error, setError] = useState<{ goalId: string; message: string } | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  const patchItem = (goalId: string, itemId: string, patch: Partial<ProgressItem>) =>
    onGoalsChange((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, items: g.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : g))
    );

  async function toggleItem(goal: ProgressGoal, item: ProgressItem, done: boolean) {
    setError(null);
    const before = item.doneAt;
    patchItem(goal.id, item.id, { doneAt: done ? new Date().toISOString() : null });
    const res = await fetch(`/api/pdps/${pdpId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    }).catch(() => null);
    if (!res?.ok) {
      patchItem(goal.id, item.id, { doneAt: before });
      setError({ goalId: goal.id, message: res ? await errorFrom(res, "Couldn't save") : "Couldn't save" });
    }
  }

  async function saveLink(goal: ProgressGoal, item: ProgressItem) {
    const value = (linkDrafts[item.id] ?? item.link ?? "").trim();
    if (value === (item.link ?? "")) return;
    setError(null);
    const res = await fetch(`/api/pdps/${pdpId}/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: value }),
    }).catch(() => null);
    if (!res?.ok) {
      setError({ goalId: goal.id, message: res ? await errorFrom(res, "Couldn't save the link") : "Couldn't save the link" });
      return;
    }
    patchItem(goal.id, item.id, { link: value || null });
  }

  return (
    <div className="space-y-3">
      {goals.map((goal, gi) => {
        const done = goal.items.filter((i) => i.doneAt).length;
        const total = goal.items.length;
        const complete = total > 0 && done === total;
        const theory = goal.items.filter((i) => i.type === "THEORY");
        const practice = goal.items.filter((i) => i.type === "PRACTICE");

        const renderItem = (item: ProgressItem) => {
          const isTask = item.type === "PRACTICE";
          return (
            <div key={item.id} className={cn("rounded-lg", isTask && "bg-muted/50 px-2 py-1.5")}>
              {/* Not a <label>: wrapping base-ui's Checkbox in one toggles it twice per click. */}
              <div className="flex items-start gap-2.5 text-sm">
                {editable ? (
                  <Checkbox
                    checked={!!item.doneAt}
                    onCheckedChange={(v) => toggleItem(goal, item, v === true)}
                    className="mt-0.5"
                    aria-label="Done"
                  />
                ) : (
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      item.doneAt ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {item.doneAt && <Check className="size-3" />}
                  </span>
                )}
                <span
                  onClick={editable ? () => toggleItem(goal, item, !item.doneAt) : undefined}
                  className={cn(
                    "flex-1",
                    editable && "cursor-pointer select-none",
                    item.doneAt && "text-muted-foreground line-through decoration-muted-foreground/40"
                  )}
                >
                  {isTask && <Code2 className="mr-1.5 inline size-3.5 -translate-y-px text-muted-foreground" />}
                  {item.text}
                </span>
              </div>
              {isTask &&
                (editable ? (
                  <div className="mt-1.5 flex items-center gap-1.5 pl-6">
                    <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                      value={linkDrafts[item.id] ?? item.link ?? ""}
                      onChange={(e) => setLinkDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      onBlur={() => saveLink(goal, item)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      placeholder="Link to your work — GitHub repo, PR, doc (optional)"
                      className="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
                    />
                  </div>
                ) : (
                  item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 ml-6 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" /> {item.link.replace(/^https?:\/\//, "").slice(0, 60)}
                    </a>
                  )
                ))}
            </div>
          );
        };

        return (
          <section key={goal.id} className="rounded-xl border bg-card px-4 py-3.5 shadow-xs">
            <header className="flex items-center gap-2.5 pb-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium",
                  complete ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                )}
              >
                {complete ? <Check className="size-3.5" /> : gi + 1}
              </span>
              <h3 className="min-w-0 flex-1 text-[15px] font-semibold">{goal.title}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {done}/{total}
              </span>
            </header>
            <div className="mb-3 ml-[2.125rem] h-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", complete ? "bg-success" : "bg-primary/70")}
                style={{ width: `${total ? (done / total) * 100 : 0}%` }}
              />
            </div>
            <div className="space-y-3 pl-[2.125rem]">
              <div className="space-y-1.5">{theory.map(renderItem)}</div>
              {practice.length > 0 && <div className="space-y-1.5">{practice.map(renderItem)}</div>}
              {error?.goalId === goal.id && <p className="text-xs text-destructive">{error.message}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
