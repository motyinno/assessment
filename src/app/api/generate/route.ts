import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";

export const runtime = "nodejs";
export const maxDuration = 60;
import {
  loadTemplate,
  loadMapping,
  loadAliases,
  resolveMapping,
} from "@/lib/data-loader";
import {
  escXml,
  mkP,
  mkBullet,
  mkRow,
  resetParaIdCounter,
} from "@/lib/xml-helpers";
import type { CategoryInfo, EmployeeInfo, GenerateSettings } from "@/lib/types";
import prisma from "@/lib/prisma";

interface GenerateBody {
  weakTopics: CategoryInfo[];
  info: EmployeeInfo;
  settings: GenerateSettings;
  useAI?: boolean;
  assessmentId?: string;
}

/**
 * POST /api/generate
 * Generates the PDP .docx file.
 * Body: { weakTopics, info, settings, useAI }
 * Returns the .docx as binary (application/octet-stream).
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateBody = await request.json();
    const { weakTopics, info, settings, useAI = false, assessmentId } = body;

    console.log("Generate PDP - useAI:", useAI, "assessmentId:", assessmentId);

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
    const replacements: [string, string][] = ([
      ["\u2019s NAME SURNAME", info.manager || ""],
      ["M\u2019s NAME SURNAME", info.manager || ""],
      ["M&#x2019;s NAME SURNAME", info.manager || ""],
      ["NAME SURNAME", info.employee || ""],
      ["05.12.2022", info.next_date || ""],
    ] as [string, string][]).sort((a, b) => b[0].length - a[0].length);

    for (const [old, nw] of replacements) {
      docXml = docXml.split(escXml(old)).join(escXml(nw));
      docXml = docXml.split(old).join(escXml(nw));
    }

    let pdpData: Array<{ category: string; questions: string[]; practicalTask: string }> = [];

    if (useAI) {
      // Generate AI feedback on-the-fly
      console.log("Using AI mode - generating on-the-fly");
      if (!assessmentId) {
        return NextResponse.json(
          { error: "assessmentId is required when useAI is true" },
          { status: 400 }
        );
      }

      const { generatePDPTopics } = await import("@/lib/ai-service");

      // Get assessment results from database
      const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
          participants: {
            where: { participantRole: "SUBJECT" },
            include: { user: true },
          },
          results: {
            orderBy: { category: "asc" },
          },
        },
      });

      if (!assessment) {
        return NextResponse.json(
          { error: "Assessment not found" },
          { status: 404 }
        );
      }

      const subject = assessment.participants[0]?.user;
      if (!subject) {
        return NextResponse.json(
          { error: "No subject found for assessment" },
          { status: 400 }
        );
      }

      // Convert results to AI service format
      const assessmentResults = assessment.results.map((r) => ({
        category: r.category,
        score: r.score,
        comment: r.comment || "",
        subtopics: r.subtopics ? JSON.parse(r.subtopics) : [],
      }));

      // Generate AI feedback and PDP topics
      const aiResponse = await generatePDPTopics(
        assessmentResults,
        subject.name,
        assessment.grade,
        assessmentId
      );

      pdpData = aiResponse.pdpTopics;
      console.log("AI data generated, pdpData length:", pdpData.length);
      console.log("Sample pdpData item:", JSON.stringify(pdpData[0], null, 2));
    } else {
      // Use the old method with pre-defined topics
      console.log("Using old logic (non-AI mode)");
      const { loadPdpTopicsMarkdown } = await import("@/lib/data-loader");
      const { parsePdpTopicsMd, selectQuestions } = await import("@/lib/pdp-topics-parser");

      const md = loadPdpTopicsMarkdown();
      const pdpTopics = parsePdpTopicsMd(md);
      const mapping = loadMapping(info.grade || "jun");
      const aliases = loadAliases();
      const maxQ = settings.maxQuestions || 2;

      pdpData = weakTopics.map((cat) => {
        const matched = resolveMapping(cat.name, mapping, aliases);
        const { questions, task } = selectQuestions(pdpTopics, matched, maxQ);
        return {
          category: cat.name,
          questions: questions.length ? questions : (cat.subtopics || []).slice(0, maxQ),
          practicalTask: task || "",
        };
      });
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

    // Build data rows from AI-generated or pre-defined data
    console.log("Building data rows from pdpData...");
    const rows = pdpData.map((data) => {
      console.log("Processing data for category:", data.category);
      let content = mkP("Необходимо изучить:") + mkP("");

      if (data.questions.length) {
        data.questions.forEach((q: string) => {
          content += mkBullet(q);
        });
      }

      if (data.practicalTask && settings.includeTasks) {
        content += mkP("");
        content += mkP("Практическое задание:", {
          italic: true,
          underline: true,
        });
        content += mkP(
          data.practicalTask.length > 250 ? data.practicalTask.slice(0, 250) + "..." : data.practicalTask,
          { size: 22 }
        );
      }

      return mkRow(data.category, "", content);
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

    return new NextResponse(new Uint8Array(output), {
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
