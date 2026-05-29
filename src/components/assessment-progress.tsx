"use client";

import { Fragment, useMemo, useState } from "react";
import {
  SESSION_TYPE_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/assessment-sessions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Session {
  id: string;
  type: string;
  status: string;
  order: number;
  durationMin: number;
  assessorId: string | null;
  assessorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  meetingLink: string | null;
  meetingScheduledAt: string | null;
}

interface AssessmentProgressProps {
  sessions: Session[];
  canRunSessions: boolean;
  assessmentId: string;
  onSessionAction: (
    sessionId: string,
    action: "start" | "complete",
    extra?: { notes?: string }
  ) => void;
  onMeetingChange: () => void | Promise<void>;
  loading?: boolean;
}

export function AssessmentProgress({
  sessions,
  canRunSessions,
  assessmentId,
  onSessionAction,
  onMeetingChange,
  loading,
}: AssessmentProgressProps) {
  const [completingSession, setCompletingSession] = useState<Session | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const activeSessions = sessions.filter((s) => s.status !== "SKIPPED");
  const completedCount = activeSessions.filter(
    (s) => s.status === "COMPLETED"
  ).length;
  const totalCount = activeSessions.length;
  const completedHours = activeSessions
    .filter((s) => s.status === "COMPLETED")
    .reduce((sum, s) => sum + s.durationMin / 60, 0);
  const totalHours = activeSessions.reduce(
    (sum, s) => sum + s.durationMin / 60,
    0
  );

  function canStart(session: Session): boolean {
    if (session.status !== "NOT_STARTED") return false;
    return sessions
      .filter((s) => s.order < session.order)
      .every((s) => s.status === "COMPLETED" || s.status === "SKIPPED");
  }

  function getLineColor(prevSession: Session): string {
    if (
      prevSession.status === "COMPLETED" ||
      prevSession.status === "SKIPPED"
    ) {
      return "bg-success";
    }
    return "bg-border";
  }

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-card border rounded-xl p-6 space-y-5 shadow-sm">
      {/* Stepper */}
      <div className="flex items-start">
        {sessions.map((session, index) => (
          <Fragment key={session.id}>
            {index > 0 && (
              <div className="flex-1 flex items-center pt-5">
                <div
                  className={`h-0.5 w-full ${getLineColor(sessions[index - 1])}`}
                />
              </div>
            )}
            <div
              className="flex flex-col items-center"
              style={{ minWidth: 120 }}
            >
              {/* Circle */}
              {session.status === "COMPLETED" && (
                <div className="w-10 h-10 rounded-full bg-success text-success-foreground flex items-center justify-center shadow-sm ring-2 ring-success/20">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {session.status === "SKIPPED" && (
                <div className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                  </svg>
                </div>
              )}
              {session.status === "IN_PROGRESS" && (
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground ring-4 ring-primary/20 flex items-center justify-center shadow-sm">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary-foreground animate-pulse" />
                </div>
              )}
              {session.status === "NOT_STARTED" && (
                <div className="w-10 h-10 rounded-full bg-background border-2 border-border text-muted-foreground flex items-center justify-center text-sm font-medium">
                  {session.order + 1}
                </div>
              )}

              {/* Label */}
              <span
                className={`mt-2 text-xs text-center leading-tight font-medium ${
                  session.status === "SKIPPED"
                    ? "line-through text-muted-foreground/60"
                    : session.status === "IN_PROGRESS"
                      ? "text-primary"
                      : session.status === "COMPLETED"
                        ? "text-success"
                        : "text-foreground/70"
                }`}
              >
                {SESSION_TYPE_LABELS[session.type] ?? session.type}
              </span>

              {/* Status */}
              <span
                className={`text-[10px] leading-tight mt-0.5 ${
                  session.status === "SKIPPED"
                    ? "line-through text-muted-foreground/60"
                    : session.status === "IN_PROGRESS"
                      ? "text-primary font-medium"
                      : session.status === "COMPLETED"
                        ? "text-success"
                        : "text-muted-foreground"
                }`}
              >
                {SESSION_STATUS_LABELS[session.status] ?? session.status}
              </span>

              {/* Assessor name */}
              {session.assessorName &&
                (session.status === "COMPLETED" || session.status === "IN_PROGRESS") && (
                  <span
                    className="text-[10px] text-muted-foreground mt-0.5 max-w-[120px] truncate"
                    title={session.assessorName}
                  >
                    {session.assessorName}
                  </span>
                )}

              {/* Actions */}
              {canRunSessions && session.status === "NOT_STARTED" && (
                <div className="mt-2 flex flex-col gap-1 items-stretch w-full">
                  <ScheduleMeetingControl
                    assessmentId={assessmentId}
                    session={session}
                    onMeetingChange={onMeetingChange}
                  />
                  {canStart(session) && (
                    <button
                      className="text-xs font-medium px-2 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      disabled={loading}
                      onClick={() => onSessionAction(session.id, "start")}
                    >
                      Start
                    </button>
                  )}
                </div>
              )}
              {canRunSessions && session.status === "IN_PROGRESS" && (
                <div className="mt-2 flex flex-col gap-1 items-stretch w-full">
                  {session.meetingLink && (
                    <a
                      href={session.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-center text-[11px] px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/5 whitespace-nowrap"
                    >
                      Open meeting
                    </a>
                  )}
                  <button
                    className="text-xs font-medium px-3 py-1.5 rounded-md bg-success text-success-foreground hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    disabled={loading}
                    onClick={() => {
                      setCompletingSession(session);
                      setCompleteNotes("");
                    }}
                  >
                    Complete
                  </button>
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Summary */}
      <div className="pt-4 border-t space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Progress: <span className="text-foreground font-medium">{completedCount}</span> of {totalCount} sessions · {completedHours} of {totalHours} hr
          </span>
          <span className="font-semibold text-foreground">{progressPercent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <CompleteSessionDialog
        session={completingSession}
        notes={completeNotes}
        onNotesChange={setCompleteNotes}
        loading={!!loading}
        onCancel={() => setCompletingSession(null)}
        onConfirm={() => {
          if (!completingSession) return;
          const trimmed = completeNotes.trim();
          if (!trimmed) return;
          onSessionAction(completingSession.id, "complete", { notes: trimmed });
          setCompletingSession(null);
          setCompleteNotes("");
        }}
      />
    </div>
  );
}

function CompleteSessionDialog({
  session,
  notes,
  onNotesChange,
  onCancel,
  onConfirm,
  loading,
}: {
  session: Session | null;
  notes: string;
  onNotesChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!session) return null;
  const label = SESSION_TYPE_LABELS[session.type] ?? session.type;
  const canSubmit = notes.trim().length > 0 && !loading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-xl shadow-xl ring-1 ring-border w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b">
          <h2 className="text-base font-semibold">Complete session</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {label} · add feedback about this session — it will be saved in the history.
          </p>
        </div>
        <div className="px-6 py-4 space-y-2">
          <label className="text-xs font-medium text-foreground">
            Session feedback <span className="text-destructive">*</span>
          </label>
          <textarea
            autoFocus
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Describe how the session went: strengths, growth areas, notes..."
            rows={6}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            This text will appear in the "Session history" section.
          </p>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-medium px-4 py-2 rounded-md border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canSubmit}
            className="text-sm font-medium px-4 py-2 rounded-md bg-success text-success-foreground hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Saving..." : "Complete session"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScheduleMeetingControl({
  assessmentId,
  session,
  onMeetingChange,
}: {
  assessmentId: string;
  session: Session;
  onMeetingChange: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasMeeting = !!session.meetingLink;

  async function submit(startsAt: Date) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/sessions/meeting`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.id, startsAt: startsAt.toISOString() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create meeting");
      }
      await onMeetingChange();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-stretch w-full">
      {hasMeeting && (
        <a
          href={session.meetingLink!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-[11px] px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/5 whitespace-nowrap"
          title={
            session.meetingScheduledAt
              ? `Scheduled for ${new Date(session.meetingScheduledAt).toLocaleString("en-US")}`
              : undefined
          }
        >
          Open meeting
        </a>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-center text-[11px] px-2 py-1 rounded-md border border-primary/60 text-primary hover:bg-primary/5 whitespace-nowrap"
      >
        {hasMeeting ? "Reschedule" : "Schedule meeting"}
      </button>
      <MeetingSchedulerDialog
        open={open}
        onOpenChange={setOpen}
        initialIso={session.meetingScheduledAt}
        sessionLabel={SESSION_TYPE_LABELS[session.type] ?? session.type}
        sessionDurationMin={session.durationMin}
        saving={saving}
        error={error}
        hasMeeting={hasMeeting}
        onConfirm={submit}
      />
    </div>
  );
}

// ---------- DateTime picker dialog ----------

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildCalendarCells(year: number, month: number): Date[] {
  // Monday-first 6-row grid (42 cells) including spillover from prev/next months.
  const firstOfMonth = new Date(year, month, 1);
  // 0 (Mon) ... 6 (Sun)
  const weekdayMonFirst = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - weekdayMonFirst);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return cells;
}

// 15-minute slots from 09:00 to 19:00 inclusive. Users who need something
// outside this range can type an arbitrary HH:MM into the time input above
// the slot list.
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 19; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 19 && m > 0) continue;
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return out;
})();

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function formatSummary(d: Date): string {
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

function MeetingSchedulerDialog({
  open,
  onOpenChange,
  initialIso,
  sessionLabel,
  sessionDurationMin,
  saving,
  error,
  hasMeeting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialIso: string | null;
  sessionLabel: string;
  sessionDurationMin: number;
  saving: boolean;
  error: string | null;
  hasMeeting: boolean;
  onConfirm: (startsAt: Date) => void | Promise<void>;
}) {
  const initial = useMemo(() => {
    if (initialIso) return new Date(initialIso);
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return d;
  }, [initialIso]);

  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(initial));
  const [selectedTime, setSelectedTime] = useState<string>(() =>
    `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
  );
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => ({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  }));

  const today = startOfDay(new Date());
  const cells = useMemo(
    () => buildCalendarCells(viewMonth.year, viewMonth.month),
    [viewMonth]
  );

  function pickPreset(preset: "today-14" | "tomorrow-10" | "tomorrow-14" | "next-week") {
    const base = new Date();
    if (preset === "today-14") {
      base.setHours(14, 0, 0, 0);
    } else if (preset === "tomorrow-10") {
      base.setDate(base.getDate() + 1);
      base.setHours(10, 0, 0, 0);
    } else if (preset === "tomorrow-14") {
      base.setDate(base.getDate() + 1);
      base.setHours(14, 0, 0, 0);
    } else {
      base.setDate(base.getDate() + 7);
      base.setHours(10, 0, 0, 0);
    }
    setSelectedDate(startOfDay(base));
    setSelectedTime(
      `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`
    );
    setViewMonth({ year: base.getFullYear(), month: base.getMonth() });
  }

  const combined = useMemo(() => {
    const [h, m] = selectedTime.split(":").map(Number);
    const d = new Date(selectedDate);
    d.setHours(h, m, 0, 0);
    return d;
  }, [selectedDate, selectedTime]);

  const isInPast = combined.getTime() < Date.now() - 60_000;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {hasMeeting ? "Reschedule meeting" : "Schedule meeting"}
            <span className="block text-sm font-normal text-muted-foreground mt-1">
              {sessionLabel} · {sessionDurationMin} min
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          <PresetChip label="Today, 2:00 PM" onClick={() => pickPreset("today-14")} />
          <PresetChip label="Tomorrow, 10:00 AM" onClick={() => pickPreset("tomorrow-10")} />
          <PresetChip label="Tomorrow, 2:00 PM" onClick={() => pickPreset("tomorrow-14")} />
          <PresetChip label="Next week" onClick={() => pickPreset("next-week")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_130px]">
          {/* Calendar */}
          <div className="rounded-lg border border-border p-3 bg-background">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                aria-label="Previous month"
                className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                onClick={() =>
                  setViewMonth((v) => {
                    const m = v.month - 1;
                    return m < 0
                      ? { year: v.year - 1, month: 11 }
                      : { year: v.year, month: m };
                  })
                }
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="text-sm font-medium">
                {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
              </span>
              <button
                type="button"
                aria-label="Next month"
                className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
                onClick={() =>
                  setViewMonth((v) => {
                    const m = v.month + 1;
                    return m > 11
                      ? { year: v.year + 1, month: 0 }
                      : { year: v.year, month: m };
                  })
                }
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] text-muted-foreground mb-1">
              {WEEKDAY_SHORT.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((d) => {
                const inMonth = d.getMonth() === viewMonth.month;
                const isSelected = sameDay(d, selectedDate);
                const isToday = sameDay(d, today);
                const isPast = d < today;
                return (
                  <button
                    type="button"
                    key={d.toISOString()}
                    disabled={isPast}
                    onClick={() => {
                      setSelectedDate(startOfDay(d));
                      if (d.getMonth() !== viewMonth.month) {
                        setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
                      }
                    }}
                    className={
                      "h-8 rounded-md text-xs transition-colors " +
                      (isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : isToday
                          ? "bg-muted text-foreground font-medium ring-1 ring-border hover:bg-accent"
                          : inMonth
                            ? "text-foreground hover:bg-accent"
                            : "text-muted-foreground/50 hover:bg-accent/50") +
                      (isPast ? " opacity-40 cursor-not-allowed hover:bg-transparent" : "")
                    }
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time column */}
          <div className="rounded-lg border border-border bg-background flex flex-col max-h-[260px]">
            <div className="sticky top-0 bg-background px-2 py-2 border-b space-y-1">
              <label className="block text-[11px] font-medium text-muted-foreground px-1">
                Time
              </label>
              <input
                type="time"
                step={60}
                value={selectedTime}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isValidTime(v)) setSelectedTime(v);
                }}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="p-1.5 flex flex-col gap-0.5 overflow-y-auto">
              {TIME_SLOTS.map((t) => {
                const [h, m] = t.split(":").map(Number);
                const slot = new Date(selectedDate);
                slot.setHours(h, m, 0, 0);
                const slotPast = slot.getTime() < Date.now() - 60_000;
                const active = selectedTime === t;
                return (
                  <button
                    type="button"
                    key={t}
                    disabled={slotPast}
                    onClick={() => setSelectedTime(t)}
                    className={
                      "h-7 rounded-md text-xs transition-colors " +
                      (active
                        ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                        : "text-foreground hover:bg-accent") +
                      (slotPast ? " opacity-40 cursor-not-allowed hover:bg-transparent" : "")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="font-medium">{formatSummary(combined)}</span>
          {isInPast && (
            <span className="text-xs text-destructive ml-auto">In the past</span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(combined)}
            disabled={saving || isInPast}
          >
            {saving ? "Saving..." : hasMeeting ? "Reschedule" : "Create meeting"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-1 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {label}
    </button>
  );
}
