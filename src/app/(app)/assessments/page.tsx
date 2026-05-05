"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { gradeLabel } from "@/lib/grades";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

interface Assessment {
  id: string;
  title: string;
  status: string;
  grade: string;
  scheduledAt: string | null;
  createdAt: string;
  participants: Array<{
    id: string;
    participantRole: string;
    user: { id: string; name: string; email: string };
  }>;
  _count: { results: number; pdps: number };
}

export default function AssessmentsPage() {
  const { data: session } = useSession();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [filter, setFilter] = useState<string>("ALL");

  useEffect(() => {
    fetch("/api/assessments")
      .then((r) => r.json())
      .then(setAssessments);
  }, []);

  const filtered =
    filter === "ALL"
      ? assessments
      : assessments.filter((a) => a.status === filter);

  const role = session?.user?.role;
  const isAssessor = role === "ASSESSOR";
  const isPrivileged = role === "ADMIN" || role === "ASSESSOR";

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessments</h1>
          <p className="page-subtitle mt-1">
            {isPrivileged ? "All assessments in the system" : "Assessments you're involved in"}
          </p>
        </div>
        {isAssessor && (
          <Link href="/assessments/new" className={buttonVariants({ size: "lg" })}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create assessment
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {["ALL", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => {
          const count =
            s === "ALL"
              ? assessments.length
              : assessments.filter((a) => a.status === s).length;
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all " +
                (active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-border hover:ring-primary/30")
              }
            >
              {s === "ALL" ? "All" : statusLabels[s]}
              <span
                className={
                  "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold " +
                  (active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground")
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                </svg>
              </div>
              <p className="text-sm font-medium text-foreground">No assessments found</p>
              <p className="text-xs text-muted-foreground">Try changing the filter or creating a new assessment.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const subjects = a.participants
                    .filter((p) => p.participantRole === "SUBJECT")
                    .map((p) => p.user.name);
                  return (
                    <TableRow key={a.id} className="group/row">
                      <TableCell className="font-medium">
                        <Link href={`/assessments/${a.id}`} className="hover:text-primary transition-colors">
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{gradeLabel(a.grade)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[a.status]}>
                          {statusLabels[a.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {subjects.join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.scheduledAt
                          ? new Date(a.scheduledAt).toLocaleDateString("en-US")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <Link
                          href={`/assessments/${a.id}`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Open →
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
