import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentAssessor,
  requireAssessmentSessionRunner,
} from "@/lib/auth-helpers";
import { buildSessionsForGrade, SESSION_STATUSES } from "@/lib/assessment-sessions";
import { syncSessionAssets } from "@/lib/session-sync";
import { sessionPatchSchema } from "@/lib/schemas";
import {
  badRequest,
  notFound,
  parseJsonBody,
  log,
} from "@/lib/api-helpers";

/**
 * After a session is marked COMPLETED, Google publishes the recording to
 * Drive asynchronously — usually ready within 1–5 minutes. Schedule a
 * one-shot delayed sync attempt so the UI shows the auto-fetched recording
 * without the assessor needing to click anything.
 *
 * In dev (node server) setTimeout survives until the process is killed.
 * In a serverless deployment this is unreliable — you'd want a proper job
 * queue or the Drive-watch webhook flow for production.
 */
function scheduleDelayedSync(args: {
  assessmentId: string;
  sessionId: string;
  actorUserId: string;
}) {
  const delayMs = 3 * 60 * 1000; // 3 min
  setTimeout(() => {
    syncSessionAssets(args).catch((e) => {
      log.warn("Delayed session sync failed", {
        error: e instanceof Error ? e.message : String(e),
        assessmentId: args.assessmentId,
        sessionId: args.sessionId,
      });
    });
  }, delayMs).unref?.();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentRead(id);
  if (guard.error) return guard.error;

  const sessions = await prisma.assessmentSession.findMany({
    where: { assessmentId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(sessions);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentAssessor(id);
  if (guard.error) return guard.error;

  const existing = await prisma.assessmentSession.findFirst({
    where: { assessmentId: id },
  });
  if (existing) {
    return badRequest("Sessions for this assessment have already been created");
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: {
      participants: {
        include: {
          user: { select: { id: true, softAiInterviewPassed: true } },
        },
      },
    },
  });
  if (!assessment) return notFound("Assessment not found");

  const subject = assessment.participants.find(
    (p) => p.participantRole === "SUBJECT"
  );
  if (!subject) return badRequest("Assessment subject not found");

  const templates = buildSessionsForGrade(
    assessment.grade,
    subject.user.softAiInterviewPassed,
    assessment.assessmentType
  );

  await prisma.assessmentSession.createMany({
    data: templates.map((t) => ({
      assessmentId: id,
      type: t.type as never,
      status: t.status as never,
      order: t.order,
      durationMin: t.durationMin,
    })),
  });

  const sessions = await prisma.assessmentSession.findMany({
    where: { assessmentId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(sessions, { status: 201 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentSessionRunner(id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, sessionPatchSchema);
  if (parsed.error) return parsed.error;
  const { sessionId, status, notes, recordingLink, meetingLink } = parsed.data;

  const session = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    include: { assessment: true },
  });
  if (!session || session.assessmentId !== id) {
    return notFound("Session not found");
  }

  if (session.assessment.status === "CANCELLED") {
    return badRequest("Can't modify a session of a cancelled assessment");
  }

  const validTransitions: Partial<Record<typeof session.status, typeof session.status>> = {
    NOT_STARTED: "IN_PROGRESS",
    IN_PROGRESS: "COMPLETED",
  };

  if (status && validTransitions[session.status] !== status) {
    return badRequest(
      `Can't transition session from "${session.status}" to "${status}"`
    );
  }

  if (status === "IN_PROGRESS") {
    const previousSessions = await prisma.assessmentSession.findMany({
      where: { assessmentId: id, order: { lt: session.order } },
    });
    const allPreviousDone = previousSessions.every(
      (s) =>
        s.status === SESSION_STATUSES.COMPLETED ||
        s.status === SESSION_STATUSES.SKIPPED
    );
    if (!allPreviousDone) {
      return badRequest("All previous sessions must be completed or skipped");
    }
  }

  const updateData: Record<string, unknown> = {};
  if (status) {
    updateData.status = status;
    if (status === "IN_PROGRESS") {
      updateData.startedAt = new Date();
      updateData.assessorId = me.id;
      updateData.assessorName = me.name;
    }
    if (status === "COMPLETED") updateData.completedAt = new Date();
  }
  if (notes !== undefined) updateData.notes = notes;
  if (recordingLink !== undefined) updateData.recordingLink = recordingLink;
  if (meetingLink !== undefined) updateData.meetingLink = meetingLink;

  // The session update + cascading assessment-status update + soft-AI flag
  // should be atomic — one transaction so a partial update can't leave the
  // assessment "completed" while sessions still show otherwise.
  const updatedSession = await prisma.$transaction(async (tx) => {
    const updated = await tx.assessmentSession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // 1. SOFT_AI completion → mark user as having passed it.
    if (
      session.type === "SOFT_AI" &&
      status === SESSION_STATUSES.COMPLETED
    ) {
      const subject = await tx.assessmentParticipant.findFirst({
        where: { assessmentId: session.assessmentId, participantRole: "SUBJECT" },
      });
      if (subject) {
        await tx.user.update({
          where: { id: subject.userId },
          data: { softAiInterviewPassed: true },
        });
      }
    }

    // 2. Roll the assessment status forward when sessions transition.
    const allSessions = await tx.assessmentSession.findMany({
      where: { assessmentId: id },
    });
    const hasInProgress = allSessions.some(
      (s) => s.status === SESSION_STATUSES.IN_PROGRESS
    );
    const nonSkipped = allSessions.filter(
      (s) => s.status !== SESSION_STATUSES.SKIPPED
    );
    const allDone =
      nonSkipped.length > 0 &&
      nonSkipped.every((s) => s.status === SESSION_STATUSES.COMPLETED);

    if (hasInProgress && session.assessment.status === "PLANNED") {
      await tx.assessment.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
      });
    }
    if (allDone) {
      await tx.assessment.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    }

    return updated;
  });

  if (status === SESSION_STATUSES.COMPLETED) {
    scheduleDelayedSync({
      assessmentId: id,
      sessionId,
      actorUserId: me.id,
    });
  }

  return NextResponse.json(updatedSession);
}
