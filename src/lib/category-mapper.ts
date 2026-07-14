import { loadTechMatrix } from "./data-loader";

interface TechMatrixTopic {
  id: string;
  title: string;
}

/**
 * Normalizes a category name for matching (lowercase, remove special chars)
 */
function normalizeCategoryName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Creates a mapping from normalized category names to proper titles from tech matrix
 */
async function createCategoryMapping(): Promise<Map<string, string>> {
  const techMatrix = await loadTechMatrix();
  const mapping = new Map<string, string>();

  techMatrix.sections.forEach((section: any) => {
    section.topics.forEach((topic: TechMatrixTopic) => {
      const normalized = normalizeCategoryName(topic.title);
      mapping.set(normalized, topic.title);

      // Also map by ID for extra flexibility
      const normalizedId = normalizeCategoryName(topic.id);
      mapping.set(normalizedId, topic.title);
    });
  });

  return mapping;
}

let categoryMapping: Map<string, string> | null = null;

/**
 * Warm the category-title lookup from the (now async, DB-backed) tech matrix.
 * Callers must await this once before invoking the synchronous
 * {@link normalizeCategory} in tight loops / .map()s.
 */
export async function ensureCategoryMapping(): Promise<void> {
  if (!categoryMapping) {
    categoryMapping = await createCategoryMapping();
  }
}

/**
 * Returns the proper category title from the tech matrix. Falls back to the
 * original name if no match is found (or if the mapping isn't warmed yet).
 */
export function normalizeCategory(category: string): string {
  const normalized = normalizeCategoryName(category);
  const properTitle = categoryMapping?.get(normalized);

  return properTitle || category;
}
