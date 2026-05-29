import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessmentSessionRunner } from "@/lib/auth-helpers";
import { SESSION_TYPE_LABELS } from "@/lib/assessment-sessions";
import {
  createAssessmentMeeting,
  updateAssessmentMeeting,
  type CalendarAttendee,
} from "@/lib/google-calendar";
import { meetingScheduleSchema } from "@/lib/schemas";
import {
  badRequest,
  notFound,
  parseJsonBody,
  serverError,
} from "@/lib/api-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireAssessmentSessionRunner(id);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, meetingScheduleSchema);
  if (parsed.error) return parsed.error;
  const { sessionId, startsAt: startsAtRaw } = parsed.data;
  const startsAt = new Date(startsAtRaw);
  if (isNaN(startsAt.getTime())) return badRequest("Invalid date");

  const sess = await prisma.assessmentSession.findUnique({
    where: { id: sessionId },
    include: { assessment: true },
  });
  if (!sess || sess.assessmentId !== id) return notFound("Session not found");
  if (sess.assessment.status === "CANCELLED") {
    return badRequest("Assessment is cancelled");
  }
  if (sess.status === "COMPLETED" || sess.status === "SKIPPED") {
    return badRequest("Can't schedule a meeting for a completed session");
  }

  const subject = await prisma.assessmentParticipant.findFirst({
    where: { assessmentId: sess.assessmentId, participantRole: "SUBJECT" },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!subject?.user) return badRequest("Assessment subject not found");

  const partLabel = SESSION_TYPE_LABELS[sess.type] || sess.type;
  const summary = `${subject.user.name}/${me.name} ${partLabel}`;
  const durationMin = sess.durationMin || 60;

  // Optional guest: assessment-level setting wins; otherwise fall back to the
  // OPTIONAL_MEETING_GUEST_EMAIL env var (set in production deploys).
  // Empty/null means "no guest". This replaces the old hardcoded email.
  const optionalGuest =
    sess.assessment.optionalGuestEmail?.trim() ||
    process.env.OPTIONAL_MEETING_GUEST_EMAIL?.trim() ||
    null;

  const attendees: CalendarAttendee[] = [
    { email: subject.user.email, displayName: subject.user.name },
  ];
  if (optionalGuest) attendees.push({ email: optionalGuest, optional: true });

  let meeting;
  if (sess.calendarEventId) {
    meeting = await updateAssessmentMeeting(me.id, sess.calendarEventId, {
      startsAt,
      durationMin,
      summary,
    });
    if (!meeting) {
      meeting = await createAssessmentMeeting(me.id, {
        summary,
        description: `Assessment session for ${subject.user.name} (${partLabel}).`,
        attendees,
        startsAt,
        durationMin,
      });
    }
  } else {
    meeting = await createAssessmentMeeting(me.id, {
      summary,
      description: `Assessment session for ${subject.user.name} (${partLabel}).`,
      attendees,
      startsAt,
      durationMin,
    });
  }

  if (!meeting) {
    return serverError(
      "Failed to create the Google Calendar meeting. Check that you signed in with Google and granted calendar access."
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
