"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
import { gradeLabel, baseGrade } from "@/lib/grades";

type AssessmentType = "GENERAL" | "PDP_CHECK" | "SYSTEM_DESIGN";

interface RequestUser {
  id: string;
  name: string;
  email: string;
  grade?: string | null;
}

interface Assessor {
  id: string;
  name: string;
  email: string;
}

interface Assessment {
  id: string;
  title: string;
  status: string;
}

interface AssessmentRequest {
  id: string;
  grade: string;
  notes: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  user: RequestUser;
  assessors: Array<{
    isPrimary: boolean;
    assessor: Assessor;
  }>;
  assessment: Assessment | null;
}

export default function RequestsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<AssessmentRequest[]>([]);
  const [assessors, setAssessors] = useState<Assessor[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AssessmentRequest | null>(null);
  const [selectedAssessorIds, setSelectedAssessorIds] = useState<string[]>([]);
  const [adminNotes, setAdminNotes] = useState("");
  const [assessmentType, setAssessmentType] =
    useState<AssessmentType>("GENERAL");
  const [suggestion, setSuggestion] = useState<{
    need: number;
    pickedIds: string[];
    eligibleIds: string[];
    ongoing: Record<string, number>;
  } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchRequests();
    fetchAssessors();
  }, [session, status, router]);

  async function fetchRequests() {
    const res = await fetch("/api/assessment-requests");
    if (res.ok) setRequests(await res.json());
  }

  async function fetchAssessors() {
    // Filter server-side instead of pulling the whole directory and trimming
    // it in the browser.
    const res = await fetch("/api/users?role=ASSESSOR,ADMIN,MANAGER");
    if (res.ok) {
      setAssessors(await res.json());
    }
  }

  function openReview(req: AssessmentRequest) {
    setSelected(req);
    setSelectedAssessorIds([]);
    setAdminNotes("");
    setAssessmentType("GENERAL");
    setSuggestion(null);
    setOpen(true);
    void loadSuggestion(req.id, "GENERAL", true);
  }

  async function loadSuggestion(
    requestId: string,
    type: AssessmentType,
    applyPicked: boolean
  ) {
    setLoadingSuggestion(true);
    try {
      const res = await fetch(
        `/api/assessment-requests/${requestId}/suggest-assessors?assessmentType=${type}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        need: number;
        pickedIds: string[];
        candidates: Array<{ id: string; ongoingCount: number }>;
      };
      const ongoing: Record<string, number> = {};
      const eligibleIds: string[] = [];
      for (const c of data.candidates) {
        ongoing[c.id] = c.ongoingCount;
        eligibleIds.push(c.id);
      }
      setSuggestion({
        need: data.need,
        pickedIds: data.pickedIds,
        eligibleIds,
        ongoing,
      });
      if (applyPicked) setSelectedAssessorIds(data.pickedIds);
    } finally {
      setLoadingSuggestion(false);
    }
  }

  function onAssessmentTypeChange(type: AssessmentType) {
    setAssessmentType(type);
    if (selected) void loadSuggestion(selected.id, type, true);
  }

  function applyAutoSelection() {
    if (suggestion) setSelectedAssessorIds(suggestion.pickedIds);
  }

  function toggleAssessor(id: string) {
    setSelectedAssessorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleDecision(newStatus: "APPROVED" | "REJECTED") {
    if (!selected) return;

    const trimmedNotes = adminNotes.trim();
    if (newStatus === "REJECTED" && !trimmedNotes) return;

    const payload: Record<string, unknown> = {
      status: newStatus,
      adminNotes: trimmedNotes,
    };
    if (newStatus === "APPROVED") {
      if (selectedAssessorIds.length === 0) return;
      payload.assessorIds = selectedAssessorIds;
      payload.assessmentType = assessmentType;
    }

    const res = await fetch(`/api/assessment-requests/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Optimistic update: splice the updated row into local state instead
      // of re-fetching the whole list. The PATCH response carries the new
      // shape (with assessors join + assessment relation included).
      const updated = (await res.json()) as AssessmentRequest;
      setRequests((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r))
      );
      setOpen(false);
      setSelected(null);
    }
  }

  function renderStatusBadge(s: string) {
    switch (s) {
      case "PENDING":
        return <Badge variant="warning">Pending</Badge>;
      case "APPROVED":
        return <Badge variant="success">Approved</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessment requests</h1>
          <p className="page-subtitle mt-1">
            {pendingCount > 0
              ? `${pendingCount} pending requests`
              : "All requests reviewed"}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.user.name}</TableCell>
                  <TableCell>{gradeLabel(req.grade)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("en-US")}
                  </TableCell>
                  <TableCell>{renderStatusBadge(req.status)}</TableCell>
                  <TableCell>
                    {req.status === "PENDING" && (
                      <Button variant="outline" size="sm" onClick={() => openReview(req)}>
                        Review
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="min-w-0 space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Employee</p>
                <p className="font-medium">{selected.user.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Grade</p>
                <p className="font-medium">{gradeLabel(selected.grade)}</p>
              </div>
              {selected.notes && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Employee comment</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{selected.notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Assessment type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <label
                    className={`flex flex-col gap-1 rounded-md border p-3 cursor-pointer text-sm transition-colors ${
                      assessmentType === "GENERAL"
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="assessmentType"
                        checked={assessmentType === "GENERAL"}
                        onChange={() => onAssessmentTypeChange("GENERAL")}
                      />
                      <span className="font-medium">General assessment</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-5">
                      {baseGrade(selected.grade) === "jun" ? "2 technical" : "3 technical"} sessions, 1 hr each
                    </span>
                  </label>
                  <label
                    className={`flex flex-col gap-1 rounded-md border p-3 cursor-pointer text-sm transition-colors ${
                      assessmentType === "PDP_CHECK"
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="assessmentType"
                        checked={assessmentType === "PDP_CHECK"}
                        onChange={() => onAssessmentTypeChange("PDP_CHECK")}
                      />
                      <span className="font-medium">PDP review</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-5">
                      1 tech session, 1 hr
                    </span>
                  </label>
                  <label
                    className={`flex flex-col gap-1 rounded-md border p-3 cursor-pointer text-sm transition-colors ${
                      assessmentType === "SYSTEM_DESIGN"
                        ? "border-primary bg-primary/5"
                        : "border-input hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="assessmentType"
                        checked={assessmentType === "SYSTEM_DESIGN"}
                        onChange={() => onAssessmentTypeChange("SYSTEM_DESIGN")}
                      />
                      <span className="font-medium">System design</span>
                    </div>
                    <span className="text-xs text-muted-foreground ml-5">
                      1 design session, 1.5 hr — design feedback only
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    Assign assessors
                    {suggestion && (
                      <span className="text-xs font-normal text-muted-foreground ml-1.5">
                        (need {suggestion.need})
                      </span>
                    )}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!suggestion || loadingSuggestion}
                    onClick={applyAutoSelection}
                  >
                    {loadingSuggestion ? "Picking..." : "Auto-pick"}
                  </Button>
                </div>
                <div className="rounded-md border divide-y divide-border max-h-64 overflow-y-auto">
                  {(() => {
                    const sorted = [...assessors].sort((a, b) => {
                      const ea = suggestion?.eligibleIds.includes(a.id) ? 0 : 1;
                      const eb = suggestion?.eligibleIds.includes(b.id) ? 0 : 1;
                      if (ea !== eb) return ea - eb;
                      const oa = suggestion?.ongoing[a.id] ?? 0;
                      const ob = suggestion?.ongoing[b.id] ?? 0;
                      if (oa !== ob) return oa - ob;
                      return a.name.localeCompare(b.name);
                    });
                    return sorted.map((a) => {
                      const eligible =
                        !suggestion || suggestion.eligibleIds.includes(a.id);
                      const isPicked = suggestion?.pickedIds.includes(a.id);
                      const ongoing = suggestion?.ongoing[a.id];
                      const checked = selectedAssessorIds.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className={
                            "flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors " +
                            (checked
                              ? "bg-primary/5"
                              : eligible
                                ? "hover:bg-muted/50"
                                : "opacity-60 hover:bg-muted/40")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAssessor(a.id)}
                            className="shrink-0 rounded border-gray-300"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {a.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {a.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isPicked && (
                              <Badge variant="success" className="whitespace-nowrap">
                                Recommended
                              </Badge>
                            )}
                            {!eligible && suggestion && (
                              <Badge variant="outline" className="whitespace-nowrap">
                                not eligible
                              </Badge>
                            )}
                            {ongoing !== undefined && (
                              <span
                                className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums"
                                title="Currently active assessments"
                              >
                                {ongoing} active
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    });
                  })()}
                </div>
                {suggestion && suggestion.eligibleIds.length === 0 && (
                  <p className="text-xs text-destructive">
                    No eligible assessors per the rules (grade ≥ candidate, not the manager).
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedAssessorIds.length}
                  {suggestion && (
                    <>
                      {" · "}Rules: grade ≥ employee · not the manager · prefer those with lower load
                    </>
                  )}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Administrator comment</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Required when rejecting, optional otherwise"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="destructive"
                  onClick={() => handleDecision("REJECTED")}
                  disabled={!adminNotes.trim()}
                  title={
                    !adminNotes.trim()
                      ? "Provide a rejection reason in the comment"
                      : undefined
                  }
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleDecision("APPROVED")}
                  disabled={selectedAssessorIds.length === 0}
                >
                  Approve
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
