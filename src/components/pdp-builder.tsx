"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ArrowDown, ArrowUp, Code2, GripVertical, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";

export type ItemType = "THEORY" | "PRACTICE";

export interface BuilderItem {
  id: string;
  type: ItemType;
  text: string;
}

export interface BuilderGoal {
  id: string;
  title: string;
  matrixTopicId: string | null;
  items: BuilderItem[];
}

export interface MatrixOption {
  id: string;
  title: string;
  sectionTitle: string;
  score: number | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export interface BuilderStatus {
  saveState: SaveState;
  saveError: string | null;
  retrySave: () => void;
  topics: number;
  questions: number;
  tasks: number;
}

const SAVE_DEBOUNCE_MS = 800;

const newId = () => crypto.randomUUID();

async function errorFrom(res: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await res.json().catch(() => null), fallback);
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Textarea that grows with its content, styled as inline text until focused. */
function InlineText({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full resize-none overflow-hidden bg-transparent rounded px-1.5 py-1 -mx-1.5 leading-snug outline-none border border-transparent hover:border-border focus:border-ring focus:bg-background",
        className
      )}
    />
  );
}

/**
 * The PDP builder: reorder topics (drag or arrows) and items within a topic,
 * edit text inline, add/remove, regenerate one topic with AI. Every change is
 * autosaved as the whole plan (PUT /api/pdps/[id]).
 */
export function PdpBuilder({
  pdpId,
  initialGoals,
  matrixOptions,
  onSaved,
  onStatus,
  flushRef,
}: {
  pdpId: string;
  initialGoals: BuilderGoal[];
  matrixOptions: MatrixOption[];
  onSaved?: () => void;
  /** Save state and plan size, for the page's summary panel. */
  onStatus?: (s: BuilderStatus) => void;
  /** Set to a function that saves any pending edits now — call it before approving. */
  flushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const [goals, setGoals] = useState<BuilderGoal[]>(initialGoals);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<Set<string>>(new Set());
  const [aiError, setAiError] = useState<{ goalId: string; message: string } | null>(null);
  const [dragGoal, setDragGoal] = useState<number | null>(null);
  const [dragItem, setDragItem] = useState<{ goalId: string; index: number } | null>(null);
  const [adding, setAdding] = useState<"matrix" | "custom" | null>(null);
  const [customTitle, setCustomTitle] = useState("");

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(goals);
  latest.current = goals;

  const save = useCallback(async () => {
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const payload = latest.current
      .map((g) => ({
        id: g.id,
        title: g.title.trim() || "Untitled topic",
        matrixTopicId: g.matrixTopicId,
        items: g.items.filter((i) => i.text.trim()).map((i) => ({ id: i.id, type: i.type, text: i.text.trim() })),
      }));
    try {
      const res = await fetch(`/api/pdps/${pdpId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goals: payload }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't save"));
      setSaveError(null);
      // A newer edit may already be queued; only report "saved" when idle.
      setSaveState(dirty.current ? "saving" : "saved");
      onSaved?.();
    } catch (e) {
      dirty.current = true;
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaveState("error");
    }
  }, [pdpId, onSaved]);

  const update = useCallback(
    (fn: (prev: BuilderGoal[]) => BuilderGoal[]) => {
      setGoals((prev) => fn(prev));
      dirty.current = true;
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DEBOUNCE_MS);
    },
    [save]
  );

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = async () => {
      if (timer.current) clearTimeout(timer.current);
      await save();
      return !dirty.current;
    };
  }, [flushRef, save]);

  // Warn before closing the tab with unsaved edits; save on in-app navigation.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) {
        clearTimeout(timer.current);
        void save();
      }
    };
  }, [save]);

  const patchGoal = (goalId: string, fn: (g: BuilderGoal) => BuilderGoal) =>
    update((prev) => prev.map((g) => (g.id === goalId ? fn(g) : g)));

  async function fillWithAi(goal: Pick<BuilderGoal, "id" | "title" | "matrixTopicId">) {
    setAiBusy((s) => new Set(s).add(goal.id));
    setAiError(null);
    try {
      const res = await fetch(`/api/pdps/${pdpId}/regenerate-goal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: goal.title.trim() || "Untitled topic", matrixTopicId: goal.matrixTopicId }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't generate this topic"));
      const { items } = (await res.json()) as { items: Array<{ type: ItemType; text: string }> };
      patchGoal(goal.id, (g) => ({ ...g, items: items.map((i) => ({ id: newId(), type: i.type, text: i.text })) }));
    } catch (e) {
      setAiError({ goalId: goal.id, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setAiBusy((s) => {
        const next = new Set(s);
        next.delete(goal.id);
        return next;
      });
    }
  }

  function addGoal(title: string, matrixTopicId: string | null) {
    const goal: BuilderGoal = { id: newId(), title, matrixTopicId, items: [] };
    update((prev) => [...prev, goal]);
    setAdding(null);
    setCustomTitle("");
    void fillWithAi(goal);
  }

  const questions = goals.reduce((n, g) => n + g.items.filter((i) => i.type === "THEORY").length, 0);
  const tasks = goals.reduce((n, g) => n + g.items.filter((i) => i.type === "PRACTICE").length, 0);
  useEffect(() => {
    onStatus?.({ saveState, saveError, retrySave: () => void save(), topics: goals.length, questions, tasks });
  }, [onStatus, saveState, saveError, save, goals.length, questions, tasks]);

  const usedTopicIds = new Set(goals.map((g) => g.matrixTopicId).filter(Boolean));
  const available = matrixOptions.filter((o) => !usedTopicIds.has(o.id));

  const addLink =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className="space-y-3">
      {goals.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          The plan is empty. Add a topic from the matrix or your own below.
        </div>
      )}

      {goals.map((goal, gi) => {
        const theory = goal.items.filter((i) => i.type === "THEORY");
        const practice = goal.items.filter((i) => i.type === "PRACTICE");
        const busy = aiBusy.has(goal.id);
        const option = goal.matrixTopicId ? matrixOptions.find((o) => o.id === goal.matrixTopicId) : null;

        const renderItem = (item: BuilderItem) => {
          const index = goal.items.indexOf(item);
          const isTask = item.type === "PRACTICE";
          return (
            <div
              key={item.id}
              className={cn(
                "group/item relative flex items-start gap-2 rounded-lg pl-1 pr-7",
                isTask && "bg-muted/50 py-1.5 pl-2",
                dragItem?.goalId === goal.id && dragItem.index === index && "opacity-40"
              )}
              onDragOver={(e) => {
                if (!dragItem || dragItem.goalId !== goal.id) return;
                e.preventDefault();
                if (dragItem.index === index || goal.items[dragItem.index]?.type !== item.type) return;
                patchGoal(goal.id, (g) => ({ ...g, items: move(g.items, dragItem.index, index) }));
                setDragItem({ goalId: goal.id, index });
              }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDragItem({ goalId: goal.id, index });
                }}
                onDragEnd={() => setDragItem(null)}
                className="relative mt-[7px] flex size-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground"
                aria-label="Drag to reorder"
              >
                {isTask ? (
                  <Code2 className="size-3.5" />
                ) : (
                  <>
                    <span className="size-1.5 rounded-full bg-muted-foreground/50 group-hover/item:hidden" />
                    <GripVertical className="hidden size-3.5 group-hover/item:block" />
                  </>
                )}
              </span>
              <InlineText
                value={item.text}
                autoFocus={item.text === ""}
                placeholder={isTask ? "Describe the practical task" : "Question to study"}
                onChange={(text) =>
                  patchGoal(goal.id, (g) => ({ ...g, items: g.items.map((x) => (x.id === item.id ? { ...x, text } : x)) }))
                }
                className="text-sm"
              />
              <button
                type="button"
                onClick={() => patchGoal(goal.id, (g) => ({ ...g, items: g.items.filter((x) => x.id !== item.id) }))}
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted hover:text-destructive group-hover/item:opacity-100 focus:opacity-100"
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        };

        const addItem = (type: ItemType) =>
          patchGoal(goal.id, (g) => {
            // Keep questions before tasks so the doc reads in order.
            const item = { id: newId(), type, text: "" };
            const items =
              type === "THEORY"
                ? [...g.items.filter((i) => i.type === "THEORY"), item, ...g.items.filter((i) => i.type === "PRACTICE")]
                : [...g.items, item];
            return { ...g, items };
          });

        return (
          <section
            key={goal.id}
            className={cn(
              "group/goal rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm",
              dragGoal === gi && "opacity-40"
            )}
            onDragOver={(e) => {
              if (dragGoal === null) return;
              e.preventDefault();
              if (dragGoal === gi) return;
              update((prev) => move(prev, dragGoal, gi));
              setDragGoal(gi);
            }}
          >
            <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
              <span
                draggable
                onDragStart={() => setDragGoal(gi)}
                onDragEnd={() => setDragGoal(null)}
                className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground group-hover/goal:bg-muted/70"
                aria-label="Drag to reorder topic"
                title="Drag to reorder"
              >
                <span className="group-hover/goal:hidden">{gi + 1}</span>
                <GripVertical className="hidden size-3.5 group-hover/goal:block" />
              </span>
              <input
                value={goal.title}
                onChange={(e) => patchGoal(goal.id, (g) => ({ ...g, title: e.target.value }))}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 -mx-1.5 text-[15px] font-semibold outline-none hover:border-border focus:border-ring"
                placeholder="Topic"
              />
              {option?.score != null && (
                <Badge variant={option.score < 7 ? "destructive" : "secondary"}>{option.score}/10</Badge>
              )}
              {!goal.matrixTopicId && <Badge variant="outline">Custom</Badge>}
              <div className="flex items-center opacity-0 transition-opacity group-hover/goal:opacity-100 focus-within:opacity-100">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => fillWithAi(goal)}
                  title="Regenerate with AI — replaces this topic's questions and task"
                  aria-label="Regenerate with AI"
                >
                  <Sparkles />
                </Button>
                <Button size="icon-xs" variant="ghost" disabled={gi === 0} onClick={() => update((p) => move(p, gi, gi - 1))} aria-label="Move up" title="Move up">
                  <ArrowUp />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  disabled={gi === goals.length - 1}
                  onClick={() => update((p) => move(p, gi, gi + 1))}
                  aria-label="Move down"
                  title="Move down"
                >
                  <ArrowDown />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="hover:text-destructive"
                  onClick={() => update((p) => p.filter((g) => g.id !== goal.id))}
                  aria-label="Remove topic"
                  title="Remove topic"
                >
                  <Trash2 />
                </Button>
              </div>
            </header>

            <div className="space-y-3 px-4 pb-3.5 pl-[3.25rem]">
              {busy ? (
                <p className="flex items-center gap-2 py-1 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Generating questions and a task…
                </p>
              ) : (
                <>
                  <div className="space-y-0.5">
                    {theory.map(renderItem)}
                    <button type="button" onClick={() => addItem("THEORY")} className={addLink}>
                      <Plus className="size-3" /> Question
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {practice.map(renderItem)}
                    <button type="button" onClick={() => addItem("PRACTICE")} className={addLink}>
                      <Plus className="size-3" /> Practical task
                    </button>
                  </div>
                </>
              )}
              {aiError?.goalId === goal.id && <p className="text-xs text-destructive">{aiError.message}</p>}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-4 py-3">
        <span className="mr-1 text-sm text-muted-foreground">Add a topic</span>
        {adding === "matrix" ? (
          <select
            autoFocus
            className="h-8 max-w-full rounded-lg border bg-background px-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              const o = available.find((x) => x.id === e.target.value);
              if (o) addGoal(o.title, o.id);
            }}
            onBlur={() => setAdding(null)}
          >
            <option value="" disabled>
              Pick a matrix topic…
            </option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.sectionTitle} · {o.title}
                {o.score != null ? ` (${o.score}/10)` : ""}
              </option>
            ))}
          </select>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding("matrix")} disabled={available.length === 0}>
            <Plus /> From the matrix
          </Button>
        )}
        {adding === "custom" ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (customTitle.trim()) addGoal(customTitle.trim(), null);
            }}
          >
            <input
              autoFocus
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="GraphQL"
              className="h-8 rounded-lg border bg-background px-2 text-sm outline-none focus:border-ring"
            />
            <Button size="sm" type="submit" disabled={!customTitle.trim()}>
              Add
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(null)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding("custom")}>
            <Plus /> Your own
          </Button>
        )}
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">AI fills new topics automatically</span>
      </div>
    </div>
  );
}
