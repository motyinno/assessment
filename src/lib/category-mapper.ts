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
function createCategoryMapping(): Map<string, string> {
  const techMatrix = loadTechMatrix();
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
 * Returns the proper category title from the tech matrix
 * Falls back to the original name if no match is found
 */
export function normalizeCategory(category: string): string {
  if (!categoryMapping) {
    categoryMapping = createCategoryMapping();
  }

  const normalized = normalizeCategoryName(category);
  const properTitle = categoryMapping.get(normalized);
  
  return properTitle || category;
}
