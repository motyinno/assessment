import fs from "fs";
import path from "path";
import type { Grade, TopicMapping, TechMatrix } from "./types";

/**
 * Get the path to the data directory.
 * Works both in development and production.
 */
function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

/**
 * Load a topic mapping JSON file from data/mappings/.
 * Dynamically reads from disk so new files don't require code changes.
 */
export function loadMapping(grade: Grade): TopicMapping {
  const filePath = path.join(getDataDir(), "mappings", `${grade}.json`);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load skip-names list from data/mappings/skip-names.json.
 */
export function loadSkipNames(): string[] {
  const filePath = path.join(getDataDir(), "mappings", "skip-names.json");
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load aliases mapping from data/mappings/aliases.json.
 * Maps messy Excel category names → clean mapping keys.
 */
export function loadAliases(): Record<string, string> {
  const filePath = path.join(getDataDir(), "mappings", "aliases.json");
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Resolve a category name through aliases, then look up in the mapping.
 * 1. Direct match in mapping → return headers
 * 2. Alias match → resolve to clean key, then look up in mapping
 * 3. Fuzzy match (includes) → return headers
 * 4. No match → empty array
 */
export function resolveMapping(
  categoryName: string,
  mapping: TopicMapping,
  aliases: Record<string, string>
): string[] {
  const key = categoryName.toLowerCase().trim();

  // 1. Direct match
  if (mapping[key]) return mapping[key];

  // 2. Alias match
  const aliasTarget = aliases[key];
  if (aliasTarget && mapping[aliasTarget]) return mapping[aliasTarget];

  // 3. Fuzzy match (substring)
  for (const [k, v] of Object.entries(mapping)) {
    if (k.includes(key) || key.includes(k)) return v;
  }

  return [];
}

/**
 * List all available mapping grades by scanning data/mappings/ folder.
 * Returns grade names (filenames without .json, excluding utility files).
 */
export function listAvailableGrades(): string[] {
  const dir = path.join(getDataDir(), "mappings");
  const excluded = ["skip-names.json", "aliases.json"];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !excluded.includes(f))
    .map((f) => f.replace(".json", ""));
}

/**
 * Read the template .docx as a Buffer.
 */
export function loadTemplate(): Buffer {
  const filePath = path.join(getDataDir(), "template.docx");
  return fs.readFileSync(filePath);
}

/**
 * Read PDP topics as markdown string.
 * Prefers .md file; falls back to .docx (requires mammoth conversion externally).
 */
export function loadPdpTopicsMarkdown(): string {
  const mdPath = path.join(getDataDir(), "pdp-topics.md");
  if (fs.existsSync(mdPath)) {
    return fs.readFileSync(mdPath, "utf-8");
  }
  // Fallback: caller must convert .docx externally
  throw new Error(
    "pdp-topics.md not found in data/. Place a markdown file with PDP topics there."
  );
}

/**
 * Load tech matrix from data/tech-matrix.json.
 */
let techMatrixCache: TechMatrix | null = null;
export function loadTechMatrix(): TechMatrix {
  if (techMatrixCache) return techMatrixCache;
  const filePath = path.join(getDataDir(), "tech-matrix.json");
  const content = fs.readFileSync(filePath, "utf-8");
  techMatrixCache = JSON.parse(content);
  return techMatrixCache!;
}
