import { getValidAccessToken } from "./google-auth";

export interface CalendarAttendee {
  email: string;
  optional?: boolean;
  displayName?: string;
}

export interface CreateMeetingResult {
  eventId: string;
  htmlLink: string;
  meetLink: string | null;
}

interface CreateMeetingInput {
  summary: string;
  description?: string;
  attendees: CalendarAttendee[];
  startsAt: Date;
  durationMin: number;
  timezone?: string; // IANA, e.g. "Europe/Minsk". Falls back to UTC.
}

/**
 * Create a Calendar event on the assessor's primary calendar with an attached
 * Google Meet link. The event is created on behalf of `userId`, so that user
 * must have granted the `calendar.events` scope.
 *
 * Returns null if the user has no Google tokens or the API call failed —
 * starting the session should NOT fail if calendar creation fails.
 */
export async function createAssessmentMeeting(
  userId: string,
  input: CreateMeetingInput
): Promise<CreateMeetingResult | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const end = new Date(input.startsAt.getTime() + input.durationMin * 60_000);
  const tz = input.timezone ?? "UTC";

  const body = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startsAt.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    attendees: input.attendees.map((a) => ({
      email: a.email,
      optional: a.optional ?? false,
      displayName: a.displayName,
    })),
    conferenceData: {
      createRequest: {
        // Deterministic-ish per-session request id keeps retries idempotent.
        requestId: `pdp-${userId}-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: { useDefault: true },
  };

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
    "?conferenceDataVersion=1&sendUpdates=all";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Calendar event creation failed:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    id: string;
    htmlLink: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
  };

  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    null;

  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    meetLink,
  };
}

/**
 * Patch an existing Calendar event — used for rescheduling. Only the fields
 * provided in `patch` are sent; everything else is preserved.
 */
export async function updateAssessmentMeeting(
  userId: string,
  eventId: string,
  patch: {
    startsAt?: Date;
    durationMin?: number;
    summary?: string;
    timezone?: string;
  }
): Promise<CreateMeetingResult | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const body: Record<string, unknown> = {};
  if (patch.summary) body.summary = patch.summary;
  if (patch.startsAt) {
    const tz = patch.timezone ?? "UTC";
    body.start = { dateTime: patch.startsAt.toISOString(), timeZone: tz };
    if (patch.durationMin) {
      const end = new Date(patch.startsAt.getTime() + patch.durationMin * 60_000);
      body.end = { dateTime: end.toISOString(), timeZone: tz };
    }
  }

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=all`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Calendar event update failed:", res.status, errText);
    return null;
  }

  const data = (await res.json()) as {
    id: string;
    htmlLink: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType: string; uri: string }> };
  };

  const meetLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ||
    null;

  return { eventId: data.id, htmlLink: data.htmlLink, meetLink };
}
