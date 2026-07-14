/**
 * Kebab-case slug used for MatrixSection / MatrixTopic string ids, matching the
 * style of the seed JSON (e.g. "data-types-and-core-concepts"). Falls back to a
 * generic base when the title has no slug-able characters.
 */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item"
  );
}

/**
 * Slugify `title`, then append -2, -3, … until the id isn't in `taken`.
 */
export function uniqueSlug(title: string, taken: Set<string>): string {
  const base = slugify(title);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
