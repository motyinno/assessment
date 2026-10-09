import JSZip from "jszip";
import prisma from "@/lib/prisma";
import { parsePdpDocument } from "@/lib/ai-service";
import { readDriveDocument } from "@/lib/google-drive";
import { planSchema, savePlan, type PlanGoalInput } from "@/lib/pdp-plan";

/** The AI only needs the plan; this keeps a pathological doc from blowing the prompt. */
const MAX_DOC_CHARS = 60_000;

export class PdpImportError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tidy(text: string): string {
  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Google Doc HTML export → plain text, keeping rows, cells and bullets. */
export function htmlToText(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return tidy(
    body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(td|th)>/gi, " | ")
      .replace(/<\/(tr|p|h[1-6]|ul|ol|div)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

/** .docx → plain text, keeping rows, cells and bullets (same shape as htmlToText). */
export async function docxToText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new PdpImportError("This file isn't a valid Word document");
  const xml = await file.async("string");
  return tidy(
    xml
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, "<w:t>\n- </w:t>")
      .replace(/<\/w:tc>/g, "<w:t> | </w:t>")
      .replace(/<\/w:p>/g, "<w:t>\n</w:t>")
      .replace(/<(?!\/?w:t[ >])[^>]*>/g, "")
      .replace(/<w:t[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
  );
}

/** Parsed goals → builder goals: questions are THEORY items, tasks are PRACTICE items. */
export function parsedToPlan(
  parsed: Array<{ title: string; questions: string[]; practicalTasks: string[] }>
): PlanGoalInput[] {
  const goals = parsed.map((g) => ({
    title: g.title,
    items: [
      ...g.questions.map((text) => ({ type: "THEORY" as const, text })),
      ...g.practicalTasks.map((text) => ({ type: "PRACTICE" as const, text })),
    ],
  }));
  const result = planSchema.safeParse({ goals: goals.filter((g) => g.items.length > 0) });
  if (!result.success) throw new PdpImportError("The plan in the document is too large or malformed to import");
  return result.data.goals;
}

/**
 * Read the PDP's linked Google Doc with the acting user's token, extract its
 * plan with the AI and store it as structured goals. The document itself is
 * left untouched, and the importer only runs on plans that have no goals yet,
 * so it can never overwrite a plan someone built in the app.
 */
export async function importPdpFromDoc(pdpId: string, actorId: string): Promise<{ goals: number; items: number }> {
  const pdp = await prisma.pdp.findUniqueOrThrow({
    where: { id: pdpId },
    select: { driveFileId: true, _count: { select: { goals: true } } },
  });
  if (pdp._count.goals > 0) throw new PdpImportError("This plan already has topics");
  if (!pdp.driveFileId) throw new PdpImportError("This PDP has no Google Doc to read");

  const doc = await readDriveDocument(actorId, pdp.driveFileId);
  if (!doc.ok) {
    throw new PdpImportError(
      doc.reason === "no-token"
        ? "Connect Google in your profile to read the document"
        : doc.reason === "unsupported"
          ? "Only Google Docs and Word files can be imported"
          : "Couldn't open the document — you need at least view access to it"
    );
  }

  const text = (doc.format === "docx" ? await docxToText(doc.content as Buffer) : htmlToText(doc.content as string)).slice(
    0,
    MAX_DOC_CHARS
  );
  if (!text) throw new PdpImportError("The document is empty");

  const goals = parsedToPlan(await parsePdpDocument(text));
  if (goals.length === 0) throw new PdpImportError("Couldn't find a plan (topics with questions or tasks) in this document");

  await savePlan(pdpId, goals);
  // The doc is the source of this plan, so it isn't "stale" relative to it.
  await prisma.pdp.update({ where: { id: pdpId }, data: { docSyncedAt: new Date() } });
  return { goals: goals.length, items: goals.reduce((n, g) => n + g.items.length, 0) };
}
