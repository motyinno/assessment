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
 * Creates a mapping from normalized category names to proper titles from one
 * department's tech matrix.
 */
async function createCategoryMapping(departmentId: string): Promise<Map<string, string>> {
  const techMatrix = await loadTechMatrix(departmentId);
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

// Keyed by departmentId — each department's matrix has its own lookup.
const categoryMappingByDepartment = new Map<string, Map<string, string>>();

/**
 * Warm the category-title lookup for one department from its (async,
 * DB-backed) tech matrix. Callers must await this once before invoking the
 * synchronous {@link normalizeCategory} for that department in tight loops /
 * .map()s.
 */
export async function ensureCategoryMapping(departmentId: string): Promise<void> {
  if (!categoryMappingByDepartment.has(departmentId)) {
    categoryMappingByDepartment.set(departmentId, await createCategoryMapping(departmentId));
  }
}

/**
 * Returns the proper category title from the given department's tech matrix.
 * Falls back to the original name if no match is found (or if that
 * department's mapping isn't warmed yet).
 */
export function normalizeCategory(category: string, departmentId: string): string {
  const normalized = normalizeCategoryName(category);
  const properTitle = categoryMappingByDepartment.get(departmentId)?.get(normalized);

  return properTitle || category;
}
