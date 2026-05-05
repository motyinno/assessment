"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { gradeLabel } from "@/lib/grades";

interface AssessmentRequest {
  id: string;
  grade: string;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  assessor?: {
    name: string | null;
  } | null;
  assessment?: {
    id: string;
  } | null;
}

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "destructive",
};

export default function RequestAssessmentPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [userGrade, setUserGrade] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<AssessmentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/assessment-requests");
      if (!res.ok) throw new Error("Failed to load requests");
      const data = await res.json();
      setRequests(data);
    } catch (e: unknown) {
      console.error("Failed to load requests:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMe = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const me = await res.json();
        setUserGrade(me.grade ?? null);
      }
    } catch (e) {
      console.error("Failed to load profile:", e);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      fetchRequests();
      fetchMe();
    }
  }, [sessionStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setSubmitting(true);
    try {
      const res = await fetch("/api/assessment-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit request");
      }

      setNotes("");
      await fetchRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    router.push("/login");
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="page-title">Request assessment</h1>
        <p className="page-subtitle mt-1">
          Submit a request to take an assessment — an administrator will review it and assign assessors.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New request</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Your grade</Label>
              <div className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm">
                {userGrade ? (
                  gradeLabel(userGrade)
                ) : (
                  <span className="text-muted-foreground">
                    No grade set. Contact an administrator to assign your grade before submitting a request.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Comment</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional information (optional)"
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting || !userGrade}>
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">My requests</h2>

        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : requests.length === 0 ? (
          <p className="text-muted-foreground">No requests yet</p>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {gradeLabel(req.grade)}
                    </span>
                    <Badge
                      variant={
                        req.status === "PENDING"
                          ? "warning"
                          : req.status === "APPROVED"
                            ? "success"
                            : req.status === "REJECTED"
                              ? "destructive"
                              : "outline"
                      }
                    >
                      {statusLabels[req.status]}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>

                  {req.notes && (
                    <p className="text-sm text-muted-foreground">{req.notes}</p>
                  )}

                  {req.status === "APPROVED" && req.assessor && (
                    <p className="text-sm">
                      Assessor: {req.assessor.name || "Not assigned"}
                    </p>
                  )}

                  {req.status === "APPROVED" && req.assessment && (
                    <a
                      href={`/assessments/${req.assessment.id}`}
                      className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Go to assessment
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
