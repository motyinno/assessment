/**
 * Pure helpers for reordering tech matrix sections (admin editor drag & drop
 * and the PATCH /api/tech-matrix/sections reorder endpoint).
 */

/**
 * Move the item at `from` so it ends up at index `to` in the returned array.
 * Out-of-range indices or a no-op move return a shallow copy unchanged.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Where a dragged item lands when dropped on `targetIndex`, either above
 * (`"before"`) or below (`"after"`) it. Returns the final index for
 * `moveItem(items, from, result)`, accounting for the removal shift.
 */
export function dropIndex(
  from: number,
  targetIndex: number,
  position: "before" | "after"
): number {
  let to = position === "after" ? targetIndex + 1 : targetIndex;
  if (from < to) to -= 1;
  return to;
}

/**
 * A requested order is valid only if it's an exact permutation of the
 * department's current section ids — no missing, extra or duplicate ids.
 * That way a stale editor (someone else added/deleted a section meanwhile)
 * gets a conflict instead of silently scrambling orders.
 */
export function isPermutation(current: readonly string[], requested: readonly string[]): boolean {
  if (current.length !== requested.length) return false;
  const want = new Set(requested);
  if (want.size !== requested.length) return false;
  return current.every((id) => want.has(id));
}
