import { getValidAccessToken } from "./google-auth";

const MEET_API = "https://meet.googleapis.com/v2";

/**
 * Pull the meeting code ("abc-mnop-xyz") out of a https://meet.google.com/...
 * link. Returns null for anything else (e.g. when we stored the htmlLink
 * fallback because the event came back without a Meet conference).
 */
export function meetingCodeFromLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Pre-configure the Meet space behind a calendar event so recording starts by
 * itself once the meeting begins (no one has to press "Record").
 *
 * Requires the `meetings.space.settings` scope — the non-sensitive scope Google
 * added specifically for configuring spaces that *other* apps (here: Calendar)
 * created. Only the meeting organizer can set this, which is why we act as the
 * assessor who owns the event.
 *
 * Returns true when the space was configured. Never throws: a failure here must
 * not break scheduling, so problems are logged and reported as false.
 */
export async function enableMeetAutoRecording(
  userId: string,
  meetLink: string | null | undefined
): Promise<boolean> {
  // Opt-out switch: recordings carry consent/retention implications, so a
  // deploy can turn the whole thing off without a code change.
  if (process.env.MEET_AUTO_RECORDING === "false") return false;

  const code = meetingCodeFromLink(meetLink);
  if (!code) return false;

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;

  // The meeting code is only an alias for reads — resolve the real
  // `spaces/{space}` resource name before patching.
  const getRes = await fetch(`${MEET_API}/spaces/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!getRes.ok) {
    console.error("Meet space lookup failed:", getRes.status, await getRes.text());
    return false;
  }
  const space = (await getRes.json()) as { name?: string };
  if (!space.name) return false;

  // `autoRecordingGeneration`, not the `autoGenerationType` the configuration
  // guide shows — that spelling is v2beta's, and v2 rejects it with
  // "Unknown name ... Cannot find field".
  const field = "config.artifactConfig.recordingConfig.autoRecordingGeneration";
  const patchRes = await fetch(`${MEET_API}/${space.name}?updateMask=${field}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } },
    }),
  });

  if (!patchRes.ok) {
    console.error(
      "Meet auto-recording setup failed:",
      patchRes.status,
      await patchRes.text()
    );
    return false;
  }

  return true;
}

export interface ConferenceTiming {
  /** When the call actually started, per Meet. */
  startedAt: Date;
  /** Null while the conference is still running. */
  endedAt: Date | null;
}

interface ConferenceRecord {
  name: string;
  startTime?: string;
  endTime?: string;
}

/**
 * Read back when the Meet call behind a session actually ran.
 *
 * This is the *conference record*, not the recording file: Google publishes it
 * within moments of the call ending, while the recording itself can take
 * longer than the meeting lasted to land in Drive. So the timing is usable on
 * the same 3-minute post-completion sync that hunts for the recording, even
 * when the recording is still processing.
 *
 * Needs the `meetings.space.readonly` scope (the settings scope used for
 * auto-recording is not accepted here), and only the conference's own
 * organizer can read it — which is the assessor whose calendar holds the
 * event.
 *
 * `near` disambiguates a space that hosted several calls: a Calendar event
 * keeps ONE Meet space across reschedules, so a rescheduled session has more
 * than one conference record and "the latest" would be the wrong answer for
 * an older session. The record starting closest to the scheduled time wins.
 *
 * Returns null when nothing is configured/found — never throws, same contract
 * as the rest of this file.
 */
export async function fetchConferenceTiming(
  userId: string,
  meetLink: string | null | undefined,
  near?: Date | null
): Promise<ConferenceTiming | null> {
  const code = meetingCodeFromLink(meetLink);
  if (!code) return null;

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const filter = encodeURIComponent(`space.meeting_code = "${code}"`);
  const res = await fetch(`${MEET_API}/conferenceRecords?filter=${filter}&pageSize=25`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("Meet conference lookup failed:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { conferenceRecords?: ConferenceRecord[] };
  const records = (data.conferenceRecords ?? []).filter((r) => r.startTime);
  if (records.length === 0) return null;

  const chosen = pickConferenceRecord(records, near ?? null);
  if (!chosen?.startTime) return null;

  return {
    startedAt: new Date(chosen.startTime),
    endedAt: chosen.endTime ? new Date(chosen.endTime) : null,
  };
}

/**
 * Closest start to `near` when we know when the session was scheduled,
 * otherwise the most recent conference. Split out to keep the rule testable
 * without a network call.
 */
export function pickConferenceRecord<T extends { startTime?: string }>(
  records: T[],
  near: Date | null
): T | null {
  const dated = records.filter((r) => !!r.startTime);
  if (dated.length === 0) return null;

  if (!near) {
    return dated.reduce((best, r) =>
      new Date(r.startTime!).getTime() > new Date(best.startTime!).getTime() ? r : best
    );
  }

  const target = near.getTime();
  return dated.reduce((best, r) =>
    Math.abs(new Date(r.startTime!).getTime() - target) <
    Math.abs(new Date(best.startTime!).getTime() - target)
      ? r
      : best
  );
}
