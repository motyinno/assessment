"use client";

import { Fragment, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AssessorCombobox } from "@/components/assessor-combobox";
import { AssessmentProgress } from "@/components/assessment-progress";
import {
  SESSION_TYPE_LABELS,
  SESSION_STATUS_LABELS,
  ASSESSMENT_TYPE_LABELS,
} from "@/lib/assessment-sessions";
import { gradeLabel } from "@/lib/grades";
import { AssessmentMatrix } from "@/components/assessment-matrix";
import { cn } from "@/lib/utils";

const statusLabels: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "info" | "warning"> = {
  PLANNED: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

function SessionStatusIcon({ status }: { status: string }) {
  const base = "w-9 h-9 rounded-full flex items-center justify-center shrink-0";
  if (status === "COMPLETED") {
    return (
      <div className={cn(base, "bg-success/15 text-success ring-1 ring-success/20")}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <div className={cn(base, "bg-info/15 text-info ring-1 ring-info/20")}>
        <span className="w-2 h-2 rounded-full bg-info animate-pulse" />
      </div>
    );
  }
  if (status === "SKIPPED") {
    return (
      <div className={cn(base, "bg-muted text-muted-foreground")}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
    );
  }
  return (
    <div className={cn(base, "bg-muted text-muted-foreground")}>
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
      </svg>
    </div>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const variant =
    status === "COMPLETED"
      ? "success"
      : status === "IN_PROGRESS"
        ? "info"
        : status === "SKIPPED"
          ? "outline"
          : "outline";
  return (
    <Badge variant={variant} className="mt-0.5">
      {SESSION_STATUS_LABELS[status] || status}
    </Badge>
  );
}

interface SessionInfo {
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
  recordingLink: string | null;
}

interface Assessment {
  id: string;
  title: string;
  status: string;
  grade: string;
  assessmentType: string;
  aiFeedback: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  participants: Array<{
    id: string;
    participantRole: string;
    assignedSections: string | null;
    user: { id: string; name: string; email: string; managerId?: string | null };
  }>;
  results: Array<{
    id: string;
    category: string;
    score: number | null;
    comment: string | null;
  }>;
  pdps: Array<{
    id: string;
    fileName: string;
    createdAt: string;
    driveLink: string | null;
    user: { id: string; name: string };
  }>;
  sessions: SessionInfo[];
  viewerCanRunSessions?: boolean;
  viewerCanManageRoster?: boolean;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AssessmentDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSavedAt, setFeedbackSavedAt] = useState<number | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const id = params.id as string;
  const role = session?.user?.role;
  const isAssessor = role === "ASSESSOR" || role === "ADMIN";
  const canManageRoster = assessment?.viewerCanManageRoster ?? false;
  const canRunSessions = assessment?.viewerCanRunSessions ?? false;

  useEffect(() => {
    fetchAssessment();
  }, [id]);

  useEffect(() => {
    if (!canManageRoster) return;
    fetch("/api/users?role=ASSESSOR,MANAGER")
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [canManageRoster]);

  async function fetchAssessment() {
    const res = await fetch(`/api/assessments/${id}`);
    if (res.ok) {
      const data: Assessment = await res.json();
      setAssessment(data);
      setFeedbackText(data.aiFeedback ?? "");
    }
    setLoading(false);
  }

  async function updateStatus(status: string) {
    const res = await fetch(`/api/assessments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) fetchAssessment();
  }

  async function handleSessionAction(
    sessionId: string,
    action: "start" | "complete",
    extra?: { notes?: string }
  ) {
    setSessionActionLoading(true);
    const newStatus = action === "start" ? "IN_PROGRESS" : "COMPLETED";
    const body: Record<string, unknown> = { sessionId, status: newStatus };
    if (extra?.notes !== undefined) body.notes = extra.notes;
    const res = await fetch(`/api/assessments/${id}/sessions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      await fetchAssessment();
    }
    setSessionActionLoading(false);
  }


  async function addAssessor(userId: string) {
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/assessments/${id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, participantRole: "ASSESSOR" }),
      });
      if (res.ok) {
        await fetchAssessment();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to add assessor");
      }
    } finally {
      setRosterLoading(false);
    }
  }

  async function removeAssessor(participantId: string) {
    setRosterLoading(true);
    try {
      const res = await fetch(
        `/api/assessments/${id}/participants?participantId=${encodeURIComponent(participantId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        await fetchAssessment();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to remove assessor");
      }
    } finally {
      setRosterLoading(false);
    }
  }

  async function createSessions() {
    setSessionActionLoading(true);
    const res = await fetch(`/api/assessments/${id}/sessions`, {
      method: "POST",
    });
    if (res.ok) {
      await fetchAssessment();
    }
    setSessionActionLoading(false);
  }

  async function generateFeedback() {
    setGeneratingFeedback(true);
    try {
      const res = await fetch(`/api/assessments/${id}/feedback`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbackText(data.text ?? "");
        setFeedbackSavedAt(null);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to generate feedback");
      }
    } catch {
      alert("Failed to generate feedback");
    }
    setGeneratingFeedback(false);
  }

  async function saveFeedback() {
    setSavingFeedback(true);
    try {
      const res = await fetch(`/api/assessments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiFeedback: feedbackText }),
      });
      if (res.ok) {
        setFeedbackSavedAt(Date.now());
        setAssessment((prev) => (prev ? { ...prev, aiFeedback: feedbackText } : prev));
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save feedback");
      }
    } catch {
      alert("Failed to save feedback");
    }
    setSavingFeedback(false);
  }

  if (loading)
    return <p className="text-muted-foreground">Loading...</p>;
  if (!assessment)
    return <p className="text-destructive">Assessment not found</p>;

  const isPdpCheck = assessment.assessmentType === "PDP_CHECK";

  const subjects = assessment.participants.filter(
    (p) => p.participantRole === "SUBJECT"
  );
  const assessors = assessment.participants.filter(
    (p) => p.participantRole === "ASSESSOR"
  );

  const participantUserIds = new Set(assessment.participants.map((p) => p.user.id));
  // A subject's own manager can't assess them, so exclude them from the picker.
  const subjectManagerIds = new Set(
    subjects
      .map((p) => p.user.managerId)
      .filter((x): x is string => !!x)
  );
  const eligibleAssessors = users.filter(
    (u) =>
      (u.role === "ASSESSOR" || u.role === "MANAGER") &&
      !participantUserIds.has(u.id) &&
      !subjectManagerIds.has(u.id)
  );

  const isSubject = subjects.some((p) => p.user.id === session?.user?.id);

  const hasSessions = assessment.sessions && assessment.sessions.length > 0;
  const activeSession = hasSessions
    ? assessment.sessions.find((s) => s.status === "IN_PROGRESS")
    : null;
  const canCreateSessions =
    !hasSessions &&
    assessment.status !== "COMPLETED" &&
    assessment.status !== "CANCELLED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link href="/assessments" className="hover:text-foreground transition-colors">
              Assessments
            </Link>
            <span>/</span>
            <span className="text-foreground/70 truncate">{assessment.title}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{assessment.title}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusVariants[assessment.status]}>
              {statusLabels[assessment.status]}
            </Badge>
            <Badge variant="outline">
              {gradeLabel(assessment.grade)}
            </Badge>
            <Badge variant={isPdpCheck ? "info" : "secondary"}>
              {ASSESSMENT_TYPE_LABELS[assessment.assessmentType] || assessment.assessmentType}
            </Badge>
          </div>
        </div>

        {isAssessor && (
          <div className="flex gap-2">
            {assessment.status === "COMPLETED" && !isPdpCheck && (
              <Link href={`/assessments/${id}/generate`} className={buttonVariants()}>
                Generate PDP
              </Link>
            )}
            {assessment.status !== "CANCELLED" &&
              assessment.status !== "COMPLETED" && (
                <Button
                  variant="destructive"
                  onClick={() => updateStatus("CANCELLED")}
                >
                  Cancel
                </Button>
              )}
          </div>
        )}
      </div>

      {/* Session Progress */}
      {hasSessions && (
        <AssessmentProgress
          sessions={assessment.sessions}
          canRunSessions={canRunSessions}
          assessmentId={id}
          onSessionAction={handleSessionAction}
          onMeetingChange={fetchAssessment}
          loading={sessionActionLoading}
        />
      )}

      {/* Lazy session creation for old assessments */}
      {canCreateSessions && isAssessor && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              No sessions have been created for this assessment yet
            </p>
            <Button onClick={createSessions} disabled={sessionActionLoading}>
              Create sessions
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(assessment.createdAt).toLocaleDateString("en-US")}</span>
            </div>
            {assessment.scheduledAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheduled for</span>
                <span>
                  {new Date(assessment.scheduledAt).toLocaleDateString("en-US")}
                </span>
              </div>
            )}
            {assessment.completedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Completed</span>
                <span>
                  {new Date(assessment.completedAt).toLocaleDateString("en-US")}
                </span>
              </div>
            )}
            {assessment.notes && (
              <>
                <Separator />
                <p className="text-muted-foreground">{assessment.notes}</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Participants */}
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjects.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Subjects
                </p>
                {subjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    {isAssessor ? (
                      <Link
                        href={`/users/${p.user.id}`}
                        className="text-sm hover:text-primary hover:underline underline-offset-2 transition-colors"
                      >
                        {p.user.name}
                      </Link>
                    ) : (
                      <span className="text-sm">{p.user.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {p.user.email}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {(assessors.length > 0 || canManageRoster) && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Assessors
                </p>
                {assessors.length === 0 && (
                  <p className="text-sm text-muted-foreground py-1">
                    No assessors assigned yet
                  </p>
                )}
                {assessors.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    {isAssessor ? (
                      <Link
                        href={`/users/${p.user.id}`}
                        className="text-sm hover:text-primary hover:underline underline-offset-2 transition-colors"
                      >
                        {p.user.name}
                      </Link>
                    ) : (
                      <span className="text-sm">{p.user.name}</span>
                    )}
                    {p.assignedSections && (
                      <span className="text-xs text-muted-foreground">
                        ({JSON.parse(p.assignedSections).join(", ")})
                      </span>
                    )}
                    {canManageRoster && (
                      <button
                        type="button"
                        onClick={() => removeAssessor(p.id)}
                        disabled={rosterLoading}
                        className="ml-auto text-xs text-destructive hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {canManageRoster && (
                  <div className="mt-3">
                    <AssessorCombobox
                      options={eligibleAssessors}
                      onSelect={addAssessor}
                      disabled={rosterLoading}
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Only assessors and managers can be added. The subject&apos;s
                      own manager isn&apos;t shown.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Session History */}
      {hasSessions && assessment.sessions.some((s) => s.status === "COMPLETED" || s.status === "IN_PROGRESS") && (
        <Card>
          <CardHeader>
            <CardTitle>Session history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assessment.sessions
              .filter((s) => s.status !== "NOT_STARTED")
              .map((s) => {
                const duration =
                  s.startedAt && s.completedAt
                    ? `${Math.round(
                        (new Date(s.completedAt).getTime() -
                          new Date(s.startedAt).getTime()) /
                          60000
                      )} min`
                    : null;
                const dateStr = s.startedAt
                  ? new Date(s.startedAt).toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : null;
                const timeRange =
                  s.startedAt && s.completedAt
                    ? `${new Date(s.startedAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} – ${new Date(s.completedAt).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : s.startedAt
                      ? `from ${new Date(s.startedAt).toLocaleTimeString("en-US", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : null;

                const metaParts: React.ReactNode[] = [];
                metaParts.push(
                  <span key="assessor" className="inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    {s.assessorName || (s.status === "SKIPPED" ? "—" : "Not assigned")}
                  </span>
                );
                if (dateStr) {
                  metaParts.push(
                    <span key="when" className="inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {dateStr}
                      {timeRange && (
                        <span className="text-muted-foreground">· {timeRange}</span>
                      )}
                    </span>
                  );
                }
                if (duration || s.status === "SKIPPED") {
                  metaParts.push(
                    <span key="dur" className="inline-flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {duration ?? (s.status === "SKIPPED" ? "Skipped" : "—")}
                    </span>
                  );
                }

                return (
                  <div
                    key={s.id}
                    className="relative rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div
                      className={cn(
                        "absolute left-0 top-0 bottom-0 w-1",
                        s.status === "COMPLETED"
                          ? "bg-success"
                          : s.status === "IN_PROGRESS"
                            ? "bg-info"
                            : s.status === "SKIPPED"
                              ? "bg-muted-foreground/30"
                              : "bg-border"
                      )}
                    />
                    <div className="pl-5 pr-4 py-3.5 space-y-2.5">
                      {/* Top row: stage + status + actions */}
                      <div className="flex items-start gap-3">
                        <SessionStatusIcon status={s.status} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={cn(
                                "text-sm font-medium",
                                s.status === "SKIPPED" && "text-muted-foreground line-through"
                              )}
                            >
                              {SESSION_TYPE_LABELS[s.type] || s.type}
                            </p>
                            <SessionStatusBadge status={s.status} />
                          </div>
                        </div>
                        {s.status === "COMPLETED" && (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                            {s.recordingLink ? (
                              <a
                                href={s.recordingLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 px-2 py-1 rounded-md"
                              >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="23 7 16 12 23 17 23 7" />
                                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                </svg>
                                Recording
                              </a>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-1 rounded-md bg-muted/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                                Recording pending
                              </span>
                            )}
                            {isAssessor && !s.recordingLink && (
                              <RecordingSyncButton
                                assessmentId={id}
                                sessionId={s.id}
                                onSynced={fetchAssessment}
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Meta line */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/80 pl-12">
                        {metaParts.map((m, i) => (
                          <Fragment key={i}>{m}</Fragment>
                        ))}
                      </div>

                      {/* Feedback notes */}
                      {s.notes && (
                        <div className="pl-12">
                          <details className="group/notes">
                            <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
                              <svg
                                className="w-3.5 h-3.5 transition-transform group-open/notes:rotate-90"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                              </svg>
                              Session feedback
                            </summary>
                            <div className="mt-2 text-sm text-foreground/90 whitespace-pre-wrap rounded-md bg-muted/40 border border-border/60 p-3 leading-relaxed">
                              {s.notes}
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Tech Matrix with Self-Assessment — hidden for PDP check, collapsed by default */}
      {assessment.status !== "CANCELLED" && !isPdpCheck && (
        <Card>
          <button
            type="button"
            onClick={() => setMatrixOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-6 py-4 hover:bg-muted/40 rounded-lg transition-colors"
          >
            <span
              className="text-muted-foreground text-xs transition-transform"
              style={{ transform: matrixOpen ? "rotate(0)" : "rotate(-90deg)" }}
            >
              ▼
            </span>
            <span className="text-base font-semibold">Tech matrix</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {matrixOpen ? "Hide" : "Show"}
            </span>
          </button>
          {matrixOpen && (
            <CardContent className="pt-0">
              <AssessmentMatrix
                assessmentId={assessment.id}
                grade={assessment.grade}
                isSubject={isSubject}
                canAssess={canRunSessions}
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* Feedback — general flow only. Text can be authored manually or via AI. */}
      {assessment.status === "COMPLETED" && isAssessor && !isPdpCheck && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Assessment feedback</CardTitle>
              {feedbackSavedAt && !savingFeedback && (
                <span className="text-xs text-success inline-flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={feedbackText}
              onChange={(e) => {
                setFeedbackText(e.target.value);
                setFeedbackSavedAt(null);
              }}
              rows={10}
              placeholder="Write feedback manually, or generate it with AI and edit."
              className="w-full min-h-[220px] rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={saveFeedback}
                disabled={savingFeedback || feedbackText === (assessment.aiFeedback ?? "")}
              >
                {savingFeedback ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={generateFeedback}
                disabled={generatingFeedback}
              >
                {generatingFeedback ? "Generating..." : "Generate with AI"}
              </Button>
              {feedbackText && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFeedbackText("");
                    setFeedbackSavedAt(null);
                  }}
                >
                  Clear
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {feedbackText.length} chars
              </span>
            </div>
          </CardContent>
        </Card>
      )}



      <Button variant="outline" onClick={() => router.push("/assessments")}>
        Back to list
      </Button>
    </div>
  );
}

/**
 * The recording is pulled automatically from the assessor's Drive after the
 * meeting ends. This button is the "Refresh" fallback when Google takes
 * longer than 3 minutes to publish the file and the auto-sync missed it.
 */
function RecordingSyncButton({
  assessmentId,
  sessionId,
  onSynced,
}: {
  assessmentId: string;
  sessionId: string;
  onSynced: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triggerSync() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/assessments/${assessmentId}/sessions/${sessionId}/sync`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sync");
      }
      const data = await res.json();
      if (!data.recordingFound) {
        setError(
          "Recording not found yet. Google publishes it a few minutes after the meeting ends — try again shortly."
        );
      }
      await onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={triggerSync}
        className="inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 px-1.5 py-1 rounded-md hover:bg-muted"
        title="Sync recording from Google Drive"
      >
        <svg
          className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      </button>
      {error && <p className="text-xs text-destructive max-w-[220px]">{error}</p>}
    </div>
  );
}
