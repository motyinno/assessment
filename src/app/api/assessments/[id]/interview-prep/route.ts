import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAssessmentInterviewer } from "@/lib/auth-helpers";
import { randomUUID } from "node:crypto";
import {
  effectivePrepStatus,
  findCandidateTopics,
  loadPrepContext,
  planPrepUpdate,
  readPrepContent,
  runPrepGeneration,
  serializePrep,
  MAX_PREP_TOPICS,
  type InterviewPrepContent,
} from "@/lib/interview-prep";
import { interviewPrepAskedSchema, interviewPrepGenerateSchema } from "@/lib/schemas";
import { badRequest, conflict, notFound, parseJsonBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** Picker data (topics with candidate signals) plus this assessor's saved prep. */
export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requireAssessmentInterviewer(params.id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const ctx = await loadPrepContext(params.id, me.id);
  if (!ctx) return notFound("Assessment or its subject not found");

  const prep = await prisma.interviewPrep.findUnique({
    where: { assessmentId_assessorId: { assessmentId: params.id, assessorId: me.id } },
  });

  return NextResponse.json({
    targetGradeLabel: ctx.targetGradeLabel,
    assessmentType: ctx.assessment.assessmentType,
    maxTopics: MAX_PREP_TOPICS,
    sections: ctx.sections.map((s) => ({
      id: s.id,
      title: s.title,
      topics: s.topics.map((t) => ({ id: t.id, title: t.title, signals: t.signals })),
    })),
    defaultTopicIds: ctx.defaultTopicIds,
    prep: prep ? serializePrep(prep) : null,
  });
}

/**
 * Apply a topic selection. Topics that stay keep their questions, dropped ones
 * are removed, and only new topics go to the model — in the background: this
 * returns 202 right away and the card polls GET until the status leaves
 * GENERATING.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireAssessmentInterviewer(params.id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, interviewPrepGenerateSchema);
  if (parsed.error) return parsed.error;
  const { topicIds } = parsed.data;
  const language = parsed.data.language ?? "ru";

  const ctx = await loadPrepContext(params.id, me.id);
  if (!ctx) return notFound("Assessment or its subject not found");
  if (ctx.assessment.status === "CANCELLED" || ctx.assessment.status === "COMPLETED") {
    return badRequest("The assessment is already over");
  }

  const selected = findCandidateTopics(ctx.sections, topicIds).map((t) => t.id);
  if (selected.length === 0) return badRequest("None of the selected topics exist in the matrix");

  const where = { assessmentId_assessorId: { assessmentId: params.id, assessorId: me.id } };
  const existing = await prisma.interviewPrep.findUnique({ where });
  if (existing && effectivePrepStatus(existing) === "GENERATING") {
    return conflict("Questions are still being generated");
  }

  const previous = existing ? { language: existing.language, content: readPrepContent(existing.content) } : null;
  const { kept, toGenerate } = planPrepUpdate(previous, selected, language);
  const content: InterviewPrepContent = {
    focus: previous && previous.language === language ? previous.content.focus : "",
    topics: kept,
  };
  const generationId = toGenerate.length ? randomUUID() : null;
  const data = {
    language,
    topicIds: selected,
    content: content as unknown as Prisma.InputJsonValue,
    status: generationId ? "GENERATING" : "READY",
    error: null,
    pendingTopicIds: toGenerate,
    generationId,
    generationStartedAt: generationId ? new Date() : null,
  };
  const prep = await prisma.interviewPrep.upsert({
    where,
    create: { assessmentId: params.id, assessorId: me.id, ...data },
    update: data,
  });

  if (generationId) {
    void runPrepGeneration({
      prepId: prep.id,
      generationId,
      assessmentId: params.id,
      assessorId: me.id,
      topicIds: toGenerate,
      language,
    });
  }
  return NextResponse.json({ prep: serializePrep(prep) }, { status: generationId ? 202 : 200 });
}

/** Tick a question as asked (or untick it). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireAssessmentInterviewer(params.id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, interviewPrepAskedSchema);
  if (parsed.error) return parsed.error;
  const { questionId, asked } = parsed.data;

  const where = { assessmentId_assessorId: { assessmentId: params.id, assessorId: me.id } };
  const prep = await prisma.interviewPrep.findUnique({ where });
  if (!prep) return notFound("No interview prep yet");

  const content = readPrepContent(prep.content);
  let found = false;
  for (const topic of content.topics) {
    for (const q of topic.questions) {
      if (q.id === questionId) {
        q.asked = asked;
        found = true;
      }
    }
  }
  if (!found) return notFound("Question not found");

  await prisma.interviewPrep.update({
    where,
    data: { content: content as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ ok: true });
}
