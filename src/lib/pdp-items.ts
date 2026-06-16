import mammoth from "mammoth";
import { exportGoogleDocAsDocx } from "./google-drive";
import { log } from "./api-helpers";

// mammoth ships `convertToMarkdown` at runtime but omits it from its bundled
// type definitions; narrow the cast to just what we use.
const convertToMarkdown = (mammoth as unknown as {
  convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
}).convertToMarkdown;

export interface DerivedPdpItem {
  type: "THEORY" | "PRACTICE";
  category: string;
  title: string;
}

/** Strip mammoth's markdown emphasis, escapes, and inline anchors from a line. */
function clean(line: string): string {
  return line
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\\(.)/g, "$1") // unescape \. \- etc.
    .trim();
}

// Table-header labels emitted by the PDP template — never categories.
const TEMPLATE_HEADER_LABELS = new Set([
  "knowledge base and practice",
  "description",
  "what should be done to achieve",
  "next level",
]);

/**
 * Parse the Markdown of a generated PDP (see buildPdpDocx) into checklist
 * items. The "Hard skills" section lists, per category: the category name, a
 * `Topics to study:` label with bullet questions, and a `Practical task:` label
 * followed by the task text. The category is taken as the plain line directly
 * preceding `Topics to study:`, which is robust to the surrounding template
 * boilerplate.
 */
export function deriveItemsFromMarkdown(md: string): DerivedPdpItem[] {
  const items: DerivedPdpItem[] = [];
  let currentCategory = "";
  let mode: "none" | "questions" | "taskAwait" = "none";
  let lastPlain = "";

  for (const raw of md.split("\n")) {
    const line = clean(raw);
    if (!line) continue;
    const lower = line.toLowerCase();

    if (/^#/.test(raw)) {
      // A new top-level heading ends the skills section (e.g. "Заключение").
      if (currentCategory) break;
      lastPlain = "";
      continue;
    }

    if (/^topics to study:?$/.test(lower)) {
      if (lastPlain) currentCategory = lastPlain;
      mode = "questions";
      continue;
    }
    if (/^practical task:?$/.test(lower)) {
      mode = "taskAwait";
      continue;
    }

    const bullet = raw.trim().match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (mode === "questions" && currentCategory) {
        const q = clean(bullet[1]);
        if (q) items.push({ type: "THEORY", category: currentCategory, title: q });
      }
      continue;
    }

    if (mode === "taskAwait" && currentCategory) {
      items.push({ type: "PRACTICE", category: currentCategory, title: line });
      mode = "none";
      lastPlain = "";
      continue;
    }

    if (TEMPLATE_HEADER_LABELS.has(lower)) continue;
    lastPlain = line;
  }

  return items;
}

/**
 * Read a PDP's current document from Drive and derive its checklist items.
 * Best-effort: returns [] when the document can't be read or doesn't match the
 * expected template (so callers can fall back to an empty checklist rather than
 * failing the request). `fileOwnerUserId` must have read access to the file.
 */
export async function deriveItemsFromDriveDoc(
  fileOwnerUserId: string,
  driveFileId: string
): Promise<DerivedPdpItem[]> {
  try {
    const buffer = await exportGoogleDocAsDocx(fileOwnerUserId, driveFileId);
    if (!buffer) return [];
    const { value: md } = await convertToMarkdown({ buffer });
    return deriveItemsFromMarkdown(md);
  } catch (e) {
    log.warn("deriveItemsFromDriveDoc failed", {
      driveFileId,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}
