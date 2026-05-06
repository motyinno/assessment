import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

import {
  loadMapping,
  loadAliases,
  resolveMapping,
} from "@/lib/data-loader";
import prisma from "@/lib/prisma";
import { buildPdpDocx } from "@/lib/pdp-builder";
import { requireAuth } from "@/lib/auth-helpers";
import { isStaff } from "@/lib/roles";
import { generateBodySchema } from "@/lib/schemas";
import {
  badRequest,
  forbidden,
  notFound,
  parseJsonBody,
  parseJsonField,
  log,
} from "@/lib/api-helpers";
import { generatePDPTopics } from "@/lib/ai-service";
import { loadPdpTopicsMarkdown } from "@/lib/data-loader";
import { parsePdpTopicsMd, selectQuestions } from "@/lib/pdp-topics-parser";
import { baseGrade } from "@/lib/grades";

/**
 * POST /api/generate
 * Generates the PDP .docx file. Auth required; if `assessmentId` is provided
 * the caller must be staff or a participant of that assessment so we don't
 * leak feedback / scores via the AI path.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const parsed = await parseJsonBody(request, generateBodySchema);
  if (parsed.error) return parsed.error;
  const { weakTopics, info, settings, useAI, assessmentId } = parsed.data;

  if (weakTopics.length === 0) {
    return badRequest("No topics selected");
  }

  let pdpData: Array<{ category: string; questions: string[]; practicalTask: string }> = [];

  if (useAI) {
    if (!assessmentId) {
      return badRequest("assessmentId is required when useAI is true");
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        participants: {
          where: { participantRole: "SUBJECT" },
          include: { user: true },
        },
        results: { orderBy: { category: "asc" } },
      },
    });
    if (!assessment) return notFound("Assessment not found");

    if (!isStaff(me.role)) {
      const isParticipant = await prisma.assessmentParticipant.findFirst({
        where: { assessmentId, userId: me.id },
        select: { id: true },
      });
      if (!isParticipant) return forbidden();
    }

    const subject = assessment.participants[0]?.user;
    if (!subject) return badRequest("No subject found for assessment");

    // subtopics is now a Json column — Prisma deserializes it into the
    // native shape, so no JSON.parse needed.
    const assessmentResults = assessment.results.map((r) => ({
      category: r.category,
      score: r.score,
      comment: r.comment || "",
      subtopics: (r.subtopics as string[] | null) ?? [],
    }));

    const aiResponse = await generatePDPTopics(
      assessmentResults,
      subject.name,
      assessment.grade,
      assessmentId
    );
    pdpData = aiResponse.pdpTopics;
  } else {
    const md = loadPdpTopicsMarkdown();
    const pdpTopics = parsePdpTopicsMd(md);
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

  try {
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
  } catch (e) {
    log.error("PDP docx build failed", {
      error: e instanceof Error ? e.message : String(e),
      assessmentId,
      userId: me.id,
    });
    return badRequest("Failed to build PDP document");
  }
}

// `parseJsonField` re-exported here just in case other call sites later need
// to consume topicsJson stored on disk; current route does not use it.
void parseJsonField;
