import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessmentSessionRunner } from "@/lib/auth-helpers";
import { SESSION_TYPE_LABELS } from "@/lib/assessment-sessions";
import {
  createAssessmentMeeting,
  updateAssessmentMeeting,
  type CalendarAttendee,
} from "@/lib/google-calendar";
import { enableMeetAutoRecording } from "@/lib/google-meet";
import { resolveDepartmentMeetingGuests } from "@/lib/meeting-guest";
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

  // Sessions run one at a time: no booking a call for a later session while an
  // earlier one is still open. Mirrors the stepper, which only offers
  // scheduling on the current session, and the same gate on closing a session.
  const earlierOpen = await prisma.assessmentSession.findFirst({
    where: {
      assessmentId: sess.assessmentId,
      order: { lt: sess.order },
      status: { notIn: ["COMPLETED", "SKIPPED"] },
    },
    select: { id: true },
  });
  if (earlierOpen) {
    return badRequest("Finish the earlier sessions before scheduling this one");
  }

  const subject = await prisma.assessmentParticipant.findFirst({
    where: { assessmentId: sess.assessmentId, participantRole: "SUBJECT" },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!subject?.user) return badRequest("Assessment subject not found");

  const partLabel = sess.title ?? SESSION_TYPE_LABELS[sess.type] ?? sess.type;
  const summary = `${subject.user.name}/${me.name} ${partLabel}`;
  const durationMin = sess.durationMin || 60;

  // Optional guests: whoever the subject's department has configured in the
  // admin screen (see lib/meeting-guest.ts) — the single source. Nothing
  // configured means NOBODY is invited: no per-assessment override behind it
  // and no org-wide env default, so an empty setting can't quietly keep
  // inviting someone.
  const optionalGuests = await resolveDepartmentMeetingGuests(subject.userId);

  const attendees: CalendarAttendee[] = [
    { email: subject.user.email, displayName: subject.user.name },
    ...optionalGuests.map((email) => ({ email, optional: true })),
  ];

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

  // Turn on auto recording for the Meet space so it starts by itself when the
  // first person joins. Idempotent, and deliberately not fatal: a session that
  // can't be recorded still has to be schedulable.
  await enableMeetAutoRecording(me.id, meeting.meetLink);

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
