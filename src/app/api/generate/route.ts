import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;
import {
  loadMapping,
  loadAliases,
  resolveMapping,
} from "@/lib/data-loader";
import type { CategoryInfo, EmployeeInfo, GenerateSettings } from "@/lib/types";
import prisma from "@/lib/prisma";
import { buildPdpDocx } from "@/lib/pdp-builder";

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
      const { baseGrade } = await import("@/lib/grades");
      const mapping = loadMapping(baseGrade(info.grade) || "jun");
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

    const output = await buildPdpDocx(
      { employee: info.employee, manager: info.manager, next_date: info.next_date },
      pdpData,
      { includeTasks: settings.includeTasks }
    );

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(
          settings.outputName || "PDP.docx"
        )}"`,
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
