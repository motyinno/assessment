import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 30;
import {
  loadTemplate,
  loadPdpTopicsMarkdown,
  loadMapping,
  loadAliases,
  resolveMapping,
} from "@/lib/data-loader";
import { parsePdpTopicsMd, selectQuestions } from "@/lib/pdp-topics-parser";
import {
  escXml,
  mkP,
  mkBullet,
  mkRow,
  resetParaIdCounter,
} from "@/lib/xml-helpers";
import type { CategoryInfo, EmployeeInfo, GenerateSettings } from "@/lib/types";

interface GenerateBody {
  weakTopics: CategoryInfo[];
  info: EmployeeInfo;
  settings: GenerateSettings;
}

/**
 * POST /api/generate
 * Generates the PDP .docx file.
 * Body: { weakTopics, info, settings }
 * Returns the .docx as binary (application/octet-stream).
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateBody = await request.json();
    const { weakTopics, info, settings } = body;

    if (!weakTopics || weakTopics.length === 0) {
      return NextResponse.json(
        { error: "No topics selected" },
        { status: 400 }
      );
    }

    // Reset counter for consistent IDs
    resetParaIdCounter();

    // Load data files from disk
    const templateBuf = loadTemplate();
    const md = loadPdpTopicsMarkdown();

    // Parse PDP topics
    const pdpTopics = parsePdpTopicsMd(md);

    // Load mapping and aliases for grade
    const mapping = loadMapping(info.grade || "jun");
    const aliases = loadAliases();

    // Open template zip
    const zip = await JSZip.loadAsync(templateBuf);
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) {
      return NextResponse.json(
        { error: "Template document.xml not found" },
        { status: 500 }
      );
    }
    let docXml = await docXmlFile.async("string");

    // Replace placeholders
    const replacements: [string, string][] = [
      ["\u2019s NAME SURNAME", info.manager || ""],
      ["M\u2019s NAME SURNAME", info.manager || ""],
      ["M&#x2019;s NAME SURNAME", info.manager || ""],
      ["NAME SURNAME", info.employee || ""],
      ["05.12.2022", info.next_date || ""],
    ].sort((a, b) => b[0].length - a[0].length);

    for (const [old, nw] of replacements) {
      docXml = docXml.split(escXml(old)).join(escXml(nw));
      docXml = docXml.split(old).join(escXml(nw));
    }

    // Find table and extract header row
    const tblStart = docXml.indexOf("<w:tbl>");
    const tblEndIdx = docXml.indexOf("</w:tbl>") + "</w:tbl>".length;
    const tblXml = docXml.substring(tblStart, tblEndIdx);

    const firstTrStart = tblXml.indexOf("<w:tr>");
    let depth = 0;
    let scanPos = firstTrStart;
    let firstTrEnd = -1;
    while (scanPos < tblXml.length) {
      const nxOpen = tblXml.indexOf(
        "<w:tr>",
        scanPos + (depth === 0 ? 5 : 0)
      );
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

    if (firstTrEnd === -1) {
      return NextResponse.json(
        { error: "Could not parse template table" },
        { status: 500 }
      );
    }

    const headerRow = tblXml.substring(firstTrStart, firstTrEnd);
    const tblProps = tblXml.substring(6, firstTrStart);
    const maxQ = settings.maxQuestions || 2;

    // Build data rows
    const rows = weakTopics.map((cat) => {
      const matched = resolveMapping(cat.name, mapping, aliases);

      const { questions, task } = selectQuestions(pdpTopics, matched, maxQ);
      let content = mkP("Необходимо изучить:") + mkP("");

      if (questions.length) {
        questions.forEach((q) => {
          content += mkBullet(q);
        });
      } else {
        (cat.subtopics || []).slice(0, maxQ).forEach((s) => {
          content += mkBullet(s);
        });
      }

      if (task && settings.includeTasks) {
        content += mkP("");
        content += mkP("Практическое задание:", {
          italic: true,
          underline: true,
        });
        content += mkP(task.length > 250 ? task.slice(0, 250) + "..." : task, {
          size: 22,
        });
      }

      return mkRow(cat.name, (cat.subtopics || []).join(", "), content);
    });

    // Reassemble table
    const newTbl =
      "<w:tbl>" + tblProps + headerRow + rows.join("") + "\n</w:tbl>";
    docXml =
      docXml.substring(0, tblStart) + newTbl + docXml.substring(tblEndIdx);

    // Write back and generate output
    zip.file("word/document.xml", docXml);
    const output = await zip.generateAsync({
      type: "nodebuffer",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return new NextResponse(output, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          settings.outputName || "ИПР.docx"
        )}"`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
