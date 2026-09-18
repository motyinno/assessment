"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api-error";
import { MAX_MEETING_GUESTS } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Inherited {
  emails: string[];
  from: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The division's meeting guests: everyone auto-invited as an optional guest to
 * every assessment call of that division's people. Lives here, next to the
 * session templates, because it configures how assessments are run for a
 * division rather than anything about the org chart.
 *
 * Each add and each remove saves the whole list immediately — there is no
 * separate Save step to forget, and the list on screen is always what the next
 * meeting will use.
 *
 * `divisionId` is owned by the page (its picker drives the whole screen), so
 * this card just follows it.
 */
export function MeetingGuestSetting({
  divisionId,
  divisionName,
}: {
  divisionId: string;
  divisionName?: string | null;
}) {
  const [guests, setGuests] = useState<string[]>([]);
  const [inherited, setInherited] = useState<Inherited | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setDraft("");
    const res = await fetch(`/api/departments/${divisionId}/meeting-guest`);
    if (!res.ok) {
      setError(apiErrorMessage(await res.json().catch(() => null), "Failed to load"));
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      meetingGuestEmails: string[];
      inherited: Inherited | null;
    };
    setGuests(data.meetingGuestEmails);
    setInherited(data.inherited);
    setLoading(false);
  }, [divisionId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: string[]) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/departments/${divisionId}/meeting-guest`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingGuestEmails: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(await res.json().catch(() => null), "Failed to save"));
      return false;
    }
    const data = (await res.json()) as { meetingGuestEmails: string[] };
    // Trust the server's copy — it normalizes (trim / de-duplicate / cap).
    setGuests(data.meetingGuestEmails);
    return true;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = draft.trim();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setError("That doesn't look like an email address");
      return;
    }
    if (guests.some((g) => g.toLowerCase() === email.toLowerCase())) {
      setError("Already on the list");
      return;
    }
    if (await save([...guests, email])) setDraft("");
  }

  async function handleRemove(email: string) {
    await save(guests.filter((g) => g !== email));
  }

  const full = guests.length >= MAX_MEETING_GUESTS;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Meeting guests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Auto-invited as optional guests to every assessment meeting of people
          in {divisionName ?? "this division"}. Applies to all of its
          assessments — there is nothing to set per assessment.{" "}
          {inherited ? (
            <>
              With nobody listed here, {inherited.from}&apos;s list is used
              instead ({inherited.emails.join(", ")}).
            </>
          ) : (
            <>With nobody listed here, nobody is added to the call.</>
          )}
        </p>

        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : guests.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nobody added.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border max-w-md">
            {guests.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between gap-3 px-3 py-1.5"
              >
                <span className="text-sm truncate">{email}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => handleRemove(email)}
                  aria-label={`Remove ${email}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex items-center gap-2 max-w-md">
          <Input
            type="email"
            value={draft}
            disabled={loading || saving || full}
            onChange={(e) => {
              setDraft(e.target.value);
              setError("");
            }}
            placeholder={full ? `Limit of ${MAX_MEETING_GUESTS} reached` : "name@innowise.com"}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={loading || saving || full || !draft.trim()}>
            {saving ? "Saving…" : "Add"}
          </Button>
        </form>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
