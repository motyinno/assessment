import JSZip from "jszip";
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
 * Build a PDP .docx file from a template.
 * Mirrors the logic previously inline in /api/generate/route.ts so it can be
 * reused by the standalone-from-user-page flow.
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
      ["\u2019s NAME SURNAME", info.manager || ""],
      ["M\u2019s NAME SURNAME", info.manager || ""],
      ["M&#x2019;s NAME SURNAME", info.manager || ""],
      ["NAME SURNAME", info.employee || ""],
      ["05.12.2022", info.next_date || ""],
    ] as [string, string][]
  ).sort((a, b) => b[0].length - a[0].length);

  for (const [old, nw] of replacements) {
    docXml = docXml.split(escXml(old)).join(escXml(nw));
    docXml = docXml.split(old).join(escXml(nw));
  }

  const tblStart = docXml.indexOf("<w:tbl>");
  const tblEndIdx = docXml.indexOf("</w:tbl>") + "</w:tbl>".length;
  const tblXml = docXml.substring(tblStart, tblEndIdx);

  const firstTrStart = tblXml.indexOf("<w:tr>");
  let depth = 0;
  let scanPos = firstTrStart;
  let firstTrEnd = -1;
  while (scanPos < tblXml.length) {
    const nxOpen = tblXml.indexOf("<w:tr>", scanPos + (depth === 0 ? 5 : 0));
    const nxClose = tblXml.indexOf("</w:tr>", scanPos + 1);
    if (nxClose === -1) break;
    if (nxOpen !== -1 && nxOpen < nxClose) {
      depth++;
      scanPos = nxOpen + 6;
    } else {
      if (depth === 0) {
        firstTrEnd = nxClose + 7;
        break;
      }
      depth--;
      scanPos = nxClose + 7;
    }
  }
  if (firstTrEnd === -1) throw new Error("Could not parse template table");

  const headerRow = tblXml.substring(firstTrStart, firstTrEnd);
  const tblProps = tblXml.substring(6, firstTrStart);

  const rows = pdpData.map((data) => {
    let content = mkP("Необходимо изучить:") + mkP("");
    for (const q of data.questions) content += mkBullet(q);
    if (data.practicalTask && includeTasks) {
      content += mkP("");
      content += mkP("Практическое задание:", { italic: true, underline: true });
      content += mkP(
        data.practicalTask.length > 250
          ? data.practicalTask.slice(0, 250) + "..."
          : data.practicalTask,
        { size: 22 }
      );
    }
    return mkRow(data.category, "", content);
  });

  const newTbl = "<w:tbl>" + tblProps + headerRow + rows.join("") + "\n</w:tbl>";
  docXml = docXml.substring(0, tblStart) + newTbl + docXml.substring(tblEndIdx);

  zip.file("word/document.xml", docXml);
  const output = await zip.generateAsync({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return output as Buffer;
}