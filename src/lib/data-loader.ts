import fs from "fs";
import path from "path";
import prisma from "./prisma";
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
 * Read the seed tech matrix from data/tech-matrix.json. Used as the fallback
 * source before the DB tables are populated, and by the seed script.
 */
export function loadTechMatrixFromFile(): TechMatrix {
  const filePath = path.join(getDataDir(), "tech-matrix.json");
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Load the tech matrix from the DB (MatrixSection + MatrixTopic), ordered by
 * `order`. Falls back to the seed JSON file when the tables are still empty
 * (pre-migration / before the seed script has run). The response shape matches
 * the {@link TechMatrix} type consumed across the app.
 */
export async function loadTechMatrix(): Promise<TechMatrix> {
  const sections = await prisma.matrixSection.findMany({
    orderBy: { order: "asc" },
    include: { topics: { orderBy: { order: "asc" } } },
  });

  if (sections.length === 0) {
    return loadTechMatrixFromFile();
  }

  return {
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      topics: s.topics.map((t) => ({
        id: t.id,
        title: t.title,
        jun: t.jun,
        mid: t.mid,
        sen: t.sen,
      })),
    })),
  };
}
