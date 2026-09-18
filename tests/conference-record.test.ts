import { describe, expect, it } from "vitest";
import { pickConferenceRecord, meetingCodeFromLink } from "@/lib/google-meet";

interface Rec {
  name: string;
  startTime?: string;
}

const RECORDS: Rec[] = [
  { name: "conferenceRecords/a", startTime: "2026-09-01T09:00:00Z" },
  { name: "conferenceRecords/b", startTime: "2026-09-08T09:00:00Z" },
  { name: "conferenceRecords/c", startTime: "2026-09-15T09:00:00Z" },
];

describe("pickConferenceRecord", () => {
  it("picks the call nearest the scheduled time, not the latest one", () => {
    // A Calendar event keeps ONE Meet space across reschedules, so the space
    // accumulates a record per call — "the latest" would report last week's
    // session against a call that happened two weeks ago.
    const chosen = pickConferenceRecord(RECORDS, new Date("2026-09-08T09:05:00Z"));
    expect(chosen?.name).toBe("conferenceRecords/b");
  });

  it("falls back to the most recent call when nothing is scheduled", () => {
    expect(pickConferenceRecord(RECORDS, null)?.name).toBe("conferenceRecords/c");
  });

  it("ignores records with no start time", () => {
    const mixed: Rec[] = [{ name: "conferenceRecords/x" }, RECORDS[0]];
    const chosen = pickConferenceRecord(mixed, null);
    expect(chosen?.name).toBe("conferenceRecords/a");
  });

  it("returns null when there is nothing usable", () => {
    expect(pickConferenceRecord([] as Rec[], null)).toBeNull();
    expect(
      pickConferenceRecord([{ name: "conferenceRecords/x" }] as Rec[], null)
    ).toBeNull();
  });
});

describe("meetingCodeFromLink", () => {
  it("reads the code out of a Meet link", () => {
    expect(meetingCodeFromLink("https://meet.google.com/abc-mnop-xyz")).toBe("abc-mnop-xyz");
    expect(meetingCodeFromLink("https://meet.google.com/ABC-MNOP-XYZ?authuser=0")).toBe(
      "abc-mnop-xyz"
    );
  });

  it("returns null for the calendar htmlLink we store when there is no Meet call", () => {
    // meetingLink falls back to the event's htmlLink (see the meeting route),
    // and that must not be mistaken for a conference.
    expect(
      meetingCodeFromLink("https://www.google.com/calendar/event?eid=abc123")
    ).toBeNull();
    expect(meetingCodeFromLink(null)).toBeNull();
  });
});
