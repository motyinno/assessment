import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { loadTemplate } from "./data-loader";
import { escXml, mkP, mkBullet, mkRow, resetParaIdCounter } from "./xml-helpers";

export interface PdpDocInfo {
  employee: string;
  /** The employee's direct manager ("Непосредственный руководитель"). */
  manager?: string | null;
  /** Who composed and approved the plan ("Карту составил", footer). */
  composer?: string | null;
  composedOn?: Date | null;
  /** Date of the assessment the plan is based on (page header), if any. */
  assessedOn?: Date | null;
}

export interface PdpRow {
  category: string;
  questions: string[];
  practicalTasks: string[];
}

/**
 * Placeholder for people/dates the app can't know. The template used to carry
 * hardcoded reviewer/approver names; with per-department reviewers there's no
 * single right name, so those lines get a dash.
 */
export const PDP_DOC_DASH = "—";

function formatDate(d: Date | null | undefined): string {
  if (!d) return PDP_DOC_DASH;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Replace template text, matching both the raw and XML-escaped form. */
function replaceAll(xml: string, pairs: [string, string][]): string {
  // Longest first so "M’s NAME SURNAME" wins over "NAME SURNAME".
  for (const [old, nw] of [...pairs].sort((a, b) => b[0].length - a[0].length)) {
    xml = xml.split(escXml(old)).join(escXml(nw));
    xml = xml.split(old).join(escXml(nw));
  }
  return xml;
}

/**
 * Locate the bounds of the first `<w:tbl>` element and its first `<w:tr>` row
 * inside it. The previous implementation walked the string with `indexOf` +
 * a manual depth counter, which broke whenever the template was re-saved by
 * Word and the whitespace shifted. Using a real XML parser to *validate*
 * structure plus a depth-counted scan over `<w:tr>` keeps the byte-exact
 * substring slicing we need (Word is sensitive to original byte order) while
 * surfacing template breakage as an error rather than a silent wrong cut.
 */
function locateTableBoundaries(xml: string): {
  tblStart: number;
  tblEnd: number;
  firstTrStart: number;
  firstTrEnd: number;
} {
  // Validate that the document XML is well-formed at all — if it isn't, fail
  // loudly instead of silently producing a broken .docx.
  const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true });
  parser.parse(xml);

  const tblStart = xml.indexOf("<w:tbl>");
  const tblEnd = xml.indexOf("</w:tbl>");
  if (tblStart === -1 || tblEnd === -1) {
    throw new Error("Template is missing the expected <w:tbl> container.");
  }
  const tblFullEnd = tblEnd + "</w:tbl>".length;

  // Walk just the table fragment with a `<w:tr>` depth counter so nested
  // tables (rare but possible in Word docs) don't trip the search.
  const trOpen = "<w:tr>";
  const trClose = "</w:tr>";
  const fragment = xml.substring(tblStart, tblFullEnd);

  const firstTrStart = fragment.indexOf(trOpen);
  if (firstTrStart === -1) {
    throw new Error("Template <w:tbl> contains no <w:tr> rows.");
  }

  let depth = 0;
  let pos = firstTrStart;
  let firstTrEndLocal = -1;
  while (pos < fragment.length) {
    const nextOpen = fragment.indexOf(trOpen, pos + (depth === 0 ? trOpen.length : 0));
    const nextClose = fragment.indexOf(trClose, pos + 1);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + trOpen.length;
    } else {
      if (depth === 0) {
        firstTrEndLocal = nextClose + trClose.length;
        break;
      }
      depth--;
      pos = nextClose + trClose.length;
    }
  }
  if (firstTrEndLocal === -1) {
    throw new Error("Could not locate end of first <w:tr> in template.");
  }

  return {
    tblStart,
    tblEnd: tblFullEnd,
    firstTrStart: tblStart + firstTrStart,
    firstTrEnd: tblStart + firstTrEndLocal,
  };
}

/**
 * Build a PDP .docx from the template: header fields, one table row per goal.
 */
export async function buildPdpDocx(info: PdpDocInfo, pdpData: PdpRow[]): Promise<Buffer> {
  resetParaIdCounter();

  const templateBuf = loadTemplate();
  const zip = await JSZip.loadAsync(templateBuf);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Template document.xml not found");
  let docXml = await docXmlFile.async("string");

  const manager = info.manager?.trim() || PDP_DOC_DASH;
  const composer = info.composer?.trim() || PDP_DOC_DASH;
  docXml = replaceAll(docXml, [
    ["’s NAME SURNAME", manager],
    ["M’s NAME SURNAME", manager],
    ["M&#x2019;s NAME SURNAME", manager],
    ["NAME SURNAME", info.employee || PDP_DOC_DASH],
    ["05.12.2022", PDP_DOC_DASH], // next assessment date — not planned here
    ["SURNAME N.LN.", composer],
    ["Карту проверил Шатило М.И.", `Карту проверил: ${PDP_DOC_DASH}`],
    ["Карту утвердил: Вербовиков Н.", `Карту утвердил: ${PDP_DOC_DASH}`],
    ["30.12.1898", PDP_DOC_DASH],
    ["31.12.1898", PDP_DOC_DASH],
  ]);

  // Header: "Дата проведения оценки навыков  <date>"; footer: "Составитель: <name> <date>".
  for (const file of Object.keys(zip.files)) {
    if (!/^word\/(header|footer)\d*\.xml$/.test(file)) continue;
    const xml = await zip.file(file)!.async("string");
    const next = replaceAll(xml, [
      ["SURNAME N.LN. 31.12.1898", `${composer} ${formatDate(info.composedOn)}`],
      ["31.12.1898", formatDate(info.assessedOn)],
    ]);
    if (next !== xml) zip.file(file, next);
  }

  const { tblStart, tblEnd, firstTrStart, firstTrEnd } =
    locateTableBoundaries(docXml);
  const tblXml = docXml.substring(tblStart, tblEnd);
  const headerRow = docXml.substring(firstTrStart, firstTrEnd);
  const tblPropsLen = firstTrStart - (tblStart + "<w:tbl>".length);
  const tblProps = tblXml.substring("<w:tbl>".length, "<w:tbl>".length + tblPropsLen);

  const rows = pdpData.map((data) => {
    let content = mkP("Topics to study:") + mkP("");
    for (const q of data.questions) content += mkBullet(q);
    const tasks = data.practicalTasks.filter((t) => t.trim());
    if (tasks.length > 0) {
      content += mkP("");
      content += mkP(tasks.length > 1 ? "Practical tasks:" : "Practical task:", { italic: true, underline: true });
      // Full text: the manager wrote/edited it in the builder, so never truncate.
      for (const task of tasks) content += mkP(task, { size: 22 });
    }
    return mkRow(data.category, "", content);
  });

  const newTbl =
    "<w:tbl>" + tblProps + headerRow + rows.join("") + "\n</w:tbl>";
  docXml = docXml.substring(0, tblStart) + newTbl + docXml.substring(tblEnd);

  zip.file("word/document.xml", docXml);
  const output = await zip.generateAsync({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return output as Buffer;
}
