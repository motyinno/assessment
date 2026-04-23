import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";
import { SESSION_TYPE_LABELS } from "@/lib/assessment-sessions";
import {
  createAssessmentMeeting,
  updateAssessmentMeeting,
} from "@/lib/google-calendar";

const OPTIONAL_MEETING_GUEST = "mikhail.shatsila@innowise.com";

/**
 * POST /api/assessments/[id]/sessions/meeting
 * Body: { sessionId: string, startsAt: string (ISO datetime) }
 *
 * Schedules (or reschedules) a Google Calendar event for the session at the
 * given start time. The event gets a Google Meet link attached.
 * Attendees: subject user + mikhail.shatsila@innowise.com (optional).
 * Title: "{USER NAME}/{ASSESSOR NAME} {ASSESSMENT PART}".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session: authSession } = await requireAssessor();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const sessionId: string | undefined = body.sessionId;
  const startsAtRaw: string | undefined = body.startsAt;
  if (!sessionId || !startsAtRaw) {
    return NextResponse.json(
      { error: "sessionId и startsAt обязательны" },
      { status: 400 }
    );
  }
  const startsAt = new Date(startsAtRaw);
  if (isNaN(startsAt.getTime())) {
    return NextResponse.json({ error: "Некорректная дата" }, { status: 400 });
  }

  const sess = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    include: { assessment: true },
  });
  if (!sess || sess.assessmentId !== id) {
    return NextResponse.json({ error: "Сессия не найдена" }, { status: 404 });
  }
  if (sess.assessment.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Ассессмент отменён" },
      { status: 400 }
    );
  }
  if (sess.status === "COMPLETED" || sess.status === "SKIPPED") {
    return NextResponse.json(
      { error: "Нельзя планировать встречу для завершённой сессии" },
      { status: 400 }
    );
  }

  const subject = await prisma.assessmentParticipant.findFirst({
    where: {
      assessmentId: sess.assessmentId,
      participantRole: "SUBJECT",
    },
    include: { user: { select: { name: true, email: true } } },
  });

  if (!subject?.user) {
    return NextResponse.json(
      { error: "Субъект ассессмента не найден" },
      { status: 400 }
    );
  }

  const partLabel = SESSION_TYPE_LABELS[sess.type] || sess.type;
  const summary = `${subject.user.name}/${authSession.user.name} ${partLabel}`;
  const durationMin = sess.durationMin || 60;

  let meeting;
  if (sess.calendarEventId) {
    // Reschedule in place — patches the existing event, so attendees get an
    // update email instead of a brand-new invite.
    meeting = await updateAssessmentMeeting(authSession.user.id, sess.calendarEventId, {
      startsAt,
      durationMin,
      summary,
    });
    // If the update failed (e.g. event was deleted in Calendar), fall back to
    // creating a fresh one so the user isn't blocked.
    if (!meeting) {
      meeting = await createAssessmentMeeting(authSession.user.id, {
        summary,
        description: `Assessment session for ${subject.user.name} (${partLabel}).`,
        attendees: [
          { email: subject.user.email, displayName: subject.user.name },
          { email: OPTIONAL_MEETING_GUEST, optional: true },
        ],
        startsAt,
        durationMin,
      });
    }
  } else {
    meeting = await createAssessmentMeeting(authSession.user.id, {
      summary,
      description: `Assessment session for ${subject.user.name} (${partLabel}).`,
      attendees: [
        { email: subject.user.email, displayName: subject.user.name },
        { email: OPTIONAL_MEETING_GUEST, optional: true },
      ],
      startsAt,
      durationMin,
    });
  }

  if (!meeting) {
    return NextResponse.json(
      {
        error:
          "Не удалось создать встречу в Google Calendar. Проверьте, что вы вошли через Google и выдали доступ к календарю.",
      },
      { status: 500 }
    );
  }

  const updated = await prisma.assessmentSession.update({
    where: { id: sessionId },
    data: {
      meetingLink: meeting.meetLink || meeting.htmlLink,
      calendarEventId: meeting.eventId,
      meetingScheduledAt: startsAt,
    },
  });

  return NextResponse.json(updated);
}
