import { describe, expect, it } from "vitest";
import { pickMeetingGuests, normalizeGuestList } from "@/lib/meeting-guest";

describe("pickMeetingGuests", () => {
  it("prefers the deepest unit, so a sub-unit overrides its division", () => {
    expect(
      pickMeetingGuests([
        { name: "PHP, GO", depth: 2, meetingGuestEmails: ["division@innowise.com"] },
        { name: "PHP", depth: 3, meetingGuestEmails: ["php@innowise.com"] },
      ])
    ).toEqual(["php@innowise.com"]);
  });

  it("takes the winning unit's list WHOLE, without merging ancestors in", () => {
    // Merging would quietly grow the invite list as units are nested — the
    // most specific setting is meant to be the complete answer.
    expect(
      pickMeetingGuests([
        { name: "PHP, GO", depth: 2, meetingGuestEmails: ["division@innowise.com"] },
        { name: "PHP", depth: 3, meetingGuestEmails: ["a@innowise.com", "b@innowise.com"] },
      ])
    ).toEqual(["a@innowise.com", "b@innowise.com"]);
  });

  it("falls back to an ancestor when the person's own unit lists nobody", () => {
    expect(
      pickMeetingGuests([
        { name: "PHP, GO", depth: 2, meetingGuestEmails: ["division@innowise.com"] },
        { name: "PHP", depth: 3, meetingGuestEmails: [] },
      ])
    ).toEqual(["division@innowise.com"]);
  });

  it("breaks a same-depth tie by unit name instead of row order", () => {
    // HRM files one person in ~2.6 units, so two sibling units both naming
    // guests is a real case — it must not depend on which row came back first.
    const units = [
      { name: "GO", depth: 3, meetingGuestEmails: ["go@innowise.com"] },
      { name: "PHP", depth: 3, meetingGuestEmails: ["php@innowise.com"] },
    ];
    expect(pickMeetingGuests(units)).toEqual(["go@innowise.com"]);
    expect(pickMeetingGuests([...units].reverse())).toEqual(["go@innowise.com"]);
  });

  it("returns nobody when nothing is configured anywhere", () => {
    expect(pickMeetingGuests([{ name: "PHP", depth: 3, meetingGuestEmails: [] }])).toEqual([]);
    expect(pickMeetingGuests([])).toEqual([]);
  });
});

describe("normalizeGuestList", () => {
  it("drops blanks and trims, so a stray empty row can't invite nobody@", () => {
    expect(normalizeGuestList([" a@innowise.com ", "", "   "])).toEqual(["a@innowise.com"]);
  });

  it("de-duplicates case-insensitively, keeping the first spelling typed", () => {
    expect(normalizeGuestList(["A@innowise.com", "a@innowise.com"])).toEqual([
      "A@innowise.com",
    ]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 25 }, (_, i) => `p${i}@innowise.com`);
    expect(normalizeGuestList(many)).toHaveLength(10);
  });
});
