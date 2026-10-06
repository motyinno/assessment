import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAssessmentInterviewer } from "@/lib/auth-helpers";
import { generateMorePrepQuestions, generatePrepTask } from "@/lib/ai-service";
import {
  findCandidateTopics,
  loadPrepContext,
  normalizeAiMoreQuestions,
  normalizeAiTask,
  readPrepContent,
  type PrepCandidateTopic,
} from "@/lib/interview-prep";
import { interviewPrepTopicSchema } from "@/lib/schemas";
import { errorJson, log, notFound, parseJsonBody } from "@/lib/api-helpers";

type Params = { params: { id: string } };

/** Add questions to, or a practical task for, one topic of an existing prep. */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireAssessmentInterviewer(params.id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, interviewPrepTopicSchema);
  if (parsed.error) return parsed.error;
  const { topicId, action } = parsed.data;

  const where = { assessmentId_assessorId: { assessmentId: params.id, assessorId: me.id } };
  const prep = await prisma.interviewPrep.findUnique({ where });
  if (!prep) return notFound("No interview prep yet");
  const content = readPrepContent(prep.content);
  const topic = content.topics.find((t) => t.topicId === topicId);
  if (!topic) return notFound("Topic is not part of this prep");

  const ctx = await loadPrepContext(params.id, me.id);
  if (!ctx) return notFound("Assessment or its subject not found");
  // The matrix may have been edited since generation; fall back to the stored
  // title so the topic still works, just without skills/signals.
  const candidate: PrepCandidateTopic = findCandidateTopics(ctx.sections, [topicId])[0] ?? {
    id: topicId,
    title: topic.title,
    sectionId: "",
    sectionTitle: topic.sectionTitle,
    skills: [],
    signals: {
      selfScore: null, selfComment: null, pastScore: null, pastComment: null,
      pastDate: null, inPdp: false, pdpQuestions: [],
    },
  };
  const request = {
    targetGradeLabel: ctx.targetGradeLabel,
    band: ctx.band,
    assessmentType: ctx.assessment.assessmentType,
    language: prep.language === "en" ? ("en" as const) : ("ru" as const),
    topics: [candidate],
  };

  try {
    if (action === "more") {
      const questions = normalizeAiMoreQuestions(
        await generateMorePrepQuestions(request, topic.questions.map((q) => q.text))
      );
      if (questions.length === 0) throw new Error("The model returned no usable questions");
      topic.questions.push(...questions);
    } else {
      const task = normalizeAiTask(await generatePrepTask(request));
      if (!task) throw new Error("The model returned no usable task");
      topic.task = task;
    }
    await prisma.interviewPrep.update({
      where,
      data: { content: content as unknown as Prisma.InputJsonValue },
    });
    return NextResponse.json({ topic });
  } catch (e) {
    log.error("Interview prep topic generation failed", {
      assessmentId: params.id,
      topicId,
      action,
      error: e instanceof Error ? e.message : String(e),
    });
    return errorJson("AI_FAILED", "Couldn't generate. Try again in a minute.", 502);
  }
}
