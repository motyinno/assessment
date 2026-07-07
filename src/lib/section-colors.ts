/**
 * Per-section color palette for the tech matrix. Keyed by section id.
 * Shared by the tech-matrix table view and the roadmap view so the two stay
 * visually consistent. Section identity lives in the border/ring; progress
 * status is expressed by a separate scale (see components/roadmap-view.tsx).
 */
export interface SectionColor {
  border: string;
  bg: string;
  text: string;
}

export const SECTION_COLORS: Record<string, SectionColor> = {
  js: { border: "border-l-yellow-400", bg: "bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-300" },
  typescript: { border: "border-l-blue-500", bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-300" },
  backend: { border: "border-l-green-600", bg: "bg-green-500/10", text: "text-green-700 dark:text-green-300" },
  react: { border: "border-l-cyan-500", bg: "bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300" },
  databases: { border: "border-l-orange-500", bg: "bg-orange-500/10", text: "text-orange-700 dark:text-orange-300" },
  web: { border: "border-l-indigo-500", bg: "bg-indigo-500/10", text: "text-indigo-700 dark:text-indigo-300" },
  general: { border: "border-l-gray-500", bg: "bg-gray-500/10", text: "text-gray-700 dark:text-gray-300" },
  devops: { border: "border-l-red-500", bg: "bg-red-500/10", text: "text-red-700 dark:text-red-300" },
  "message-brokers": { border: "border-l-amber-600", bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300" },
  "principles-and-patterns": { border: "border-l-teal-600", bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-300" },
  architecture: { border: "border-l-violet-600", bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-300" },
  ai: { border: "border-l-pink-500", bg: "bg-pink-500/10", text: "text-pink-700 dark:text-pink-300" },
};

export const DEFAULT_SECTION_COLOR: SectionColor = {
  border: "border-l-gray-400",
  bg: "bg-gray-500/10",
  text: "text-gray-700 dark:text-gray-300",
};

export function sectionColor(sectionId: string): SectionColor {
  return SECTION_COLORS[sectionId] ?? DEFAULT_SECTION_COLOR;
}
