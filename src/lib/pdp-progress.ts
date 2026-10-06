/**
 * PDP progress: the employee ticks items done and attaches links to their
 * work; the manager closes the whole plan when they judge it done — not every
 * item has to be ticked for that.
 */

type ItemLike = { doneAt: Date | string | null };

/** Done items out of all items, across the whole plan. */
export function planProgress(goals: Array<{ items: ItemLike[] }>): { done: number; total: number } {
  const items = goals.flatMap((g) => g.items);
  return { done: items.filter((i) => i.doneAt).length, total: items.length };
}

/** 0–100, rounded; 0 for an empty plan. */
export function progressPercent({ done, total }: { done: number; total: number }): number {
  return total ? Math.round((done / total) * 100) : 0;
}
