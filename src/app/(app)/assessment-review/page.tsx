"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api-error";
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
import { gradeLabel, GRADE_VALUES } from "@/lib/grades";

interface SubjectUser {
  id: string;
  name: string;
  email: string;
  grade: string | null;
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

export default function AssessmentReviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [assessments, setAssessments] = useState<ReviewAssessment[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReviewAssessment | null>(null);
  const [newGrade, setNewGrade] = useState("");
  const [notes, setNotes] = useState("");
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
    setNewGrade(subjectOf(a)?.grade ?? "");
    setNotes("");
    setError("");
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
        setError(apiErrorMessage(data, "Failed to record decision"));
      }
    } finally {
      setUpgrading(false);
      setDeclining(false);
    }
  }

  const selectedSubject = selected ? subjectOf(selected) : null;
  const currentGrade = selectedSubject?.grade ?? null;
  const upgradeDisabled =
    upgrading || declining || !newGrade || newGrade === currentGrade;

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

              {selected.results.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Scores</p>
                  <ul className="text-sm divide-y divide-border rounded-md border border-border/60">
                    {selected.results.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between px-3 py-1.5"
                      >
                        <span className="truncate">{r.category}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {r.score ?? "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <Label>New grade (when upgrading)</Label>
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
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newGrade && newGrade === currentGrade && (
                  <p className="text-[11px] text-muted-foreground">
                    Same as current grade — pick a different grade to upgrade.
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
