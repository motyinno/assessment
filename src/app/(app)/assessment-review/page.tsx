"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { gradeLabel, GRADE_VALUES, gradeRank, isValidGrade } from "@/lib/grades";
import { MASTERY_THRESHOLD, ASSESSED_THRESHOLD } from "@/lib/roadmap-types";
import { cn } from "@/lib/utils";

interface SubjectUser {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  // Number of certificates the subject has pinned to their profile. A grade
  // upgrade is blocked until at least one is pinned.
  _count: { certificates: number };
}

interface ReviewResult {
  id: string;
  category: string;
  score: number | null;
  comment: string | null;
}

interface ReviewAssessment {
  id: string;
  title: string;
  grade: string;
  aiFeedback: string | null;
  submittedForReviewAt: string | null;
  participants: Array<{ id: string; user: SubjectUser }>;
  results: ReviewResult[];
}

/** Average score (0-10) and how topics split across mastery bands. */
function summarizeResults(results: ReviewResult[]) {
  let sum = 0;
  let scored = 0;
  let mastered = 0;
  let onTrack = 0;
  let needsWork = 0;
  for (const r of results) {
    if (r.score === null) continue;
    scored += 1;
    sum += r.score;
    if (r.score >= MASTERY_THRESHOLD) mastered += 1;
    else if (r.score >= ASSESSED_THRESHOLD) onTrack += 1;
    else needsWork += 1;
  }
  return {
    total: results.length,
    scored,
    avg: scored > 0 ? sum / scored : null,
    mastered,
    onTrack,
    needsWork,
  };
}

// An assessment "passes" at avg 7+ (matches the PDP "needs improvement below 7"
// rule). Assessment.grade is the subject's grade at assessment time, not a
// target — a promotion moves them one step up the ladder (e.g. Middle+ → Senior-).
const PASS_THRESHOLD = 7;

/**
 * Suggested grade to pre-fill: one step up from the subject's current grade
 * when the assessment passed cleanly (avg ≥ 7 and no critically-failing topic),
 * otherwise their current grade (i.e. no upgrade suggested).
 */
function recommendedGradeFor(a: ReviewAssessment): string {
  const currentGrade = a.participants[0]?.user.grade ?? null;
  const { avg, needsWork } = summarizeResults(a.results);
  const passed = avg !== null && avg >= PASS_THRESHOLD && needsWork === 0;
  if (passed && isValidGrade(currentGrade)) {
    const next = GRADE_VALUES[gradeRank(currentGrade) + 1];
    if (next) return next;
  }
  return currentGrade ?? "";
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= MASTERY_THRESHOLD) return "text-success";
  if (score >= ASSESSED_THRESHOLD) return "text-foreground";
  return "text-destructive";
}

export default function AssessmentReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [assessments, setAssessments] = useState<ReviewAssessment[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReviewAssessment | null>(null);
  const [newGrade, setNewGrade] = useState("");
  const [notes, setNotes] = useState("");
  const [showTopics, setShowTopics] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchAssessments();
  }, [session, status, router]);

  async function fetchAssessments() {
    const res = await fetch("/api/assessment-review");
    if (res.ok) setAssessments(await res.json());
  }

  function subjectOf(a: ReviewAssessment): SubjectUser | null {
    return a.participants[0]?.user ?? null;
  }

  function openReview(a: ReviewAssessment) {
    setSelected(a);
    setNewGrade(recommendedGradeFor(a));
    setNotes("");
    setError("");
    setShowTopics(false);
    setOpen(true);
  }

  async function decide(action: "upgrade" | "noUpgrade") {
    if (!selected) return;
    setError("");
    if (action === "upgrade") setUpgrading(true);
    else setDeclining(true);
    try {
      const res = await fetch(`/api/assessment-review/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "upgrade" ? { newGrade } : {}),
          reviewNotes: notes || undefined,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setSelected(null);
        await fetchAssessments();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to record decision");
      }
    } finally {
      setUpgrading(false);
      setDeclining(false);
    }
  }

  const selectedSubject = selected ? subjectOf(selected) : null;
  const currentGrade = selectedSubject?.grade ?? null;
  const summary = selected ? summarizeResults(selected.results) : null;
  const recommendedGrade = selected ? recommendedGradeFor(selected) : "";
  const sameAsCurrent = !!newGrade && newGrade === currentGrade;
  const hasPinnedCertificate = (selectedSubject?._count.certificates ?? 0) > 0;
  const upgradeDisabled =
    upgrading || declining || !newGrade || sameAsCurrent || !hasPinnedCertificate;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessment review</h1>
          <p className="page-subtitle mt-1">
            {assessments.length > 0
              ? `${assessments.length} assessments awaiting review`
              : "No assessments awaiting review"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Current grade</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Ended</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessments.map((a) => {
                const subject = subjectOf(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {subject ? (
                        <Link
                          href={`/users/${subject.id}`}
                          className="hover:underline"
                          title={subject.email}
                        >
                          {subject.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {subject?.grade ? (
                        <Badge variant="outline">
                          {gradeLabel(subject.grade)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[280px] truncate"
                      title={a.title}
                    >
                      <Link
                        href={`/assessments/${a.id}`}
                        className="hover:underline"
                      >
                        {a.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.submittedForReviewAt
                        ? new Date(a.submittedForReviewAt).toLocaleDateString(
                            "en-US"
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReview(a)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assessment review</DialogTitle>
          </DialogHeader>
          {selected && selectedSubject && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Subject</p>
                <p className="font-medium">
                  {selectedSubject.name}
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                    Current grade:{" "}
                    {currentGrade ? gradeLabel(currentGrade) : "Not set"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedSubject.email}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Feedback</p>
                {selected.aiFeedback ? (
                  <div className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 border border-border/60 p-3 leading-relaxed max-h-56 overflow-y-auto">
                    {selected.aiFeedback}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No feedback</p>
                )}
              </div>

              {summary && summary.total > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Result</p>
                    <button
                      type="button"
                      onClick={() => setShowTopics((v) => !v)}
                      className="text-[11px] font-medium text-primary hover:underline"
                    >
                      {showTopics
                        ? "Hide topics"
                        : `Show topics (${summary.total})`}
                    </button>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tabular-nums text-foreground">
                        {summary.avg !== null ? summary.avg.toFixed(1) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        avg score · {summary.scored}/{summary.total} scored
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-success">
                        {summary.mastered} mastered
                      </span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        {summary.onTrack} on track
                      </span>
                      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                        {summary.needsWork} needs work
                      </span>
                    </div>
                  </div>
                  {showTopics && (
                    <ul className="text-sm divide-y divide-border rounded-md border border-border/60">
                      {selected.results.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between px-3 py-1.5"
                        >
                          <span className="truncate">{r.category}</span>
                          <span
                            className={cn(
                              "tabular-nums font-medium",
                              scoreTone(r.score)
                            )}
                          >
                            {r.score ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>New grade</Label>
                  {recommendedGrade && recommendedGrade !== currentGrade ? (
                    <span className="text-[11px] text-muted-foreground">
                      Suggested:{" "}
                      <button
                        type="button"
                        onClick={() => setNewGrade(recommendedGrade)}
                        disabled={newGrade === recommendedGrade}
                        className="font-medium text-primary hover:underline disabled:no-underline disabled:text-muted-foreground disabled:opacity-100"
                      >
                        {gradeLabel(recommendedGrade)}
                      </button>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Suggested: no upgrade
                    </span>
                  )}
                </div>
                <Select
                  value={newGrade || "__none__"}
                  onValueChange={(v) =>
                    setNewGrade(!v || v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grade">
                      {(v: unknown) =>
                        typeof v === "string" && v && v !== "__none__"
                          ? gradeLabel(v)
                          : "Select grade"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GRADE_VALUES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {gradeLabel(g)}
                        {g === currentGrade ? " · current" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sameAsCurrent && (
                  <p className="text-[11px] text-muted-foreground">
                    Matches the current grade — choose “No upgrade” to keep it,
                    or pick a higher grade to promote.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reasoning for the decision"
                />
              </div>

              {!hasPinnedCertificate && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[13px] text-warning-foreground dark:text-warning">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p>
                    No certificate is pinned to{" "}
                    <Link
                      href={`/users/${selectedSubject.id}`}
                      className="font-medium underline"
                    >
                      {selectedSubject.name}
                    </Link>
                    ’s profile. Grade upgrades are blocked until a certificate is
                    pinned. You can still record “No upgrade”.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => decide("noUpgrade")}
                  disabled={upgrading || declining}
                >
                  {declining ? "Saving..." : "No upgrade"}
                </Button>
                <Button
                  onClick={() => decide("upgrade")}
                  disabled={upgradeDisabled}
                >
                  {upgrading ? "Upgrading..." : "Approve upgrade"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
