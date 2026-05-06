import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { loadTemplate } from "./data-loader";
import { escXml, mkP, mkBullet, mkRow, resetParaIdCounter } from "./xml-helpers";

export interface PdpDocInfo {
  employee: string;
  manager?: string;
  next_date?: string;
}

export interface PdpRow {
  category: string;
  questions: string[];
  practicalTask: string;
}

export interface BuildPdpOptions {
  includeTasks?: boolean;
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
 * Build a PDP .docx file from a template.
 */
export async function buildPdpDocx(
  info: PdpDocInfo,
  pdpData: PdpRow[],
  options: BuildPdpOptions = {}
): Promise<Buffer> {
  const includeTasks = options.includeTasks ?? true;

  resetParaIdCounter();

  const templateBuf = loadTemplate();
  const zip = await JSZip.loadAsync(templateBuf);
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) throw new Error("Template document.xml not found");
  let docXml = await docXmlFile.async("string");

  const replacements: [string, string][] = (
    [
      ["’s NAME SURNAME", info.manager || ""],
      ["M’s NAME SURNAME", info.manager || ""],
      ["M&#x2019;s NAME SURNAME", info.manager || ""],
      ["NAME SURNAME", info.employee || ""],
      ["05.12.2022", info.next_date || ""],
    ] as [string, string][]
  ).sort((a, b) => b[0].length - a[0].length);

  for (const [old, nw] of replacements) {
    docXml = docXml.split(escXml(old)).join(escXml(nw));
    docXml = docXml.split(old).join(escXml(nw));
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
    if (data.practicalTask && includeTasks) {
      content += mkP("");
      content += mkP("Practical task:", { italic: true, underline: true });
      content += mkP(
        data.practicalTask.length > 250
          ? data.practicalTask.slice(0, 250) + "..."
          : data.practicalTask,
        { size: 22 }
      );
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
