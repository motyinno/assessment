"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gradeLabel } from "@/lib/grades";
import {
  SESSION_TYPE_LABELS,
  SESSION_STATUS_LABELS,
  SESSION_STATUSES,
  ASSESSMENT_TYPE_LABELS,
} from "@/lib/assessment-sessions";

const assessmentStatusLabels: Record<string, string> = {
  PLANNED: "Запланирован",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const assessmentStatusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline" | "success" | "info" | "warning"
> = {
  PLANNED: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

interface SessionRow {
  id: string;
  type: string;
  status: string;
  order: number;
  assessorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  recordingLink: string | null;
  meetingLink: string | null;
}

interface ParticipantRow {
  id: string;
  participantRole: string;
  user: { id: string; name: string; email: string };
}

interface AssessmentLog {
  id: string;
  title: string;
  status: string;
  grade: string;
  assessmentType: string;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  aiFeedback: string | null;
  participants: ParticipantRow[];
  sessions: SessionRow[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SessionStatusDot({ status }: { status: string }) {
  const color =
    status === SESSION_STATUSES.COMPLETED
      ? "bg-success"
      : status === SESSION_STATUSES.IN_PROGRESS
        ? "bg-info"
        : status === SESSION_STATUSES.SKIPPED
          ? "bg-muted-foreground/40"
          : "bg-border";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

export default function AssessmentLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<AssessmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const role = session?.user?.role;
  const canAccess = role === "ADMIN" || role === "ASSESSOR";

  useEffect(() => {
    if (status === "loading") return;
    if (!canAccess) {
      router.replace("/dashboard");
      return;
    }
    fetch("/api/assessment-logs")
      .then(async (r) => {
        if (!r.ok) throw new Error("load failed");
        return r.json();
      })
      .then((data: AssessmentLog[]) => setLogs(data))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [status, canAccess, router]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (!q) return true;
      const subjects = l.participants
        .filter((p) => p.participantRole === "SUBJECT")
        .map((p) => p.user.name.toLowerCase())
        .join(" ");
      const assessors = l.participants
        .filter((p) => p.participantRole === "ASSESSOR")
        .map((p) => p.user.name.toLowerCase())
        .join(" ");
      const sessionAssessors = l.sessions
        .map((s) => (s.assessorName || "").toLowerCase())
        .join(" ");
      return (
        l.title.toLowerCase().includes(q) ||
        subjects.includes(q) ||
        assessors.includes(q) ||
        sessionAssessors.includes(q)
      );
    });
  }, [logs, search, statusFilter]);

  if (status === "loading" || loading) {
    return <p className="text-muted-foreground">Загрузка...</p>;
  }
  if (!canAccess) return null;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Журнал ассессментов</h1>
          <p className="page-subtitle mt-1">
            Все проведённые ассессменты: участники, этапы, записи и фидбек.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию, ассесируемому, асессору..."
          className="h-9 min-w-[260px] flex-1 max-w-md rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          {["ALL", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => {
            const count =
              s === "ALL" ? logs.length : logs.filter((l) => l.status === s).length;
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all " +
                  (active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-border hover:ring-primary/30")
                }
              >
                {s === "ALL" ? "Все" : assessmentStatusLabels[s]}
                <span
                  className={
                    "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-semibold " +
                    (active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 flex flex-col items-center gap-2 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Записей не найдено</p>
            <p className="text-xs text-muted-foreground">Попробуйте изменить фильтр или запрос.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => (
            <AssessmentLogCard key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentLogCard({ log }: { log: AssessmentLog }) {
  const [open, setOpen] = useState(false);

  const subjects = log.participants.filter((p) => p.participantRole === "SUBJECT");
  const assessors = log.participants.filter((p) => p.participantRole === "ASSESSOR");

  const sessionStats = log.sessions.reduce(
    (acc, s) => {
      acc.total += 1;
      if (s.status === SESSION_STATUSES.COMPLETED) acc.completed += 1;
      return acc;
    },
    { total: 0, completed: 0 }
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-muted/40 transition-colors rounded-lg"
      >
        <span
          className="text-muted-foreground text-xs pt-1.5 transition-transform shrink-0"
          style={{ transform: open ? "rotate(0)" : "rotate(-90deg)" }}
        >
          ▼
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/assessments/${log.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-semibold hover:text-primary transition-colors"
                >
                  {log.title}
                </Link>
                <Badge variant={assessmentStatusVariants[log.status]}>
                  {assessmentStatusLabels[log.status] || log.status}
                </Badge>
                <Badge variant="outline">{gradeLabel(log.grade)}</Badge>
                <Badge variant="secondary">
                  {ASSESSMENT_TYPE_LABELS[log.assessmentType] || log.assessmentType}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground/60">Ассесируемый:</span>{" "}
                  <span className="text-foreground/90">
                    {subjects.map((s) => s.user.name).join(", ") || "—"}
                  </span>
                </span>
                <span>
                  <span className="text-foreground/60">Асессоры:</span>{" "}
                  <span className="text-foreground/90">
                    {assessors.map((a) => a.user.name).join(", ") || "—"}
                  </span>
                </span>
                <span>
                  <span className="text-foreground/60">Создан:</span>{" "}
                  <span className="text-foreground/90">{formatDate(log.createdAt)}</span>
                </span>
                {log.completedAt && (
                  <span>
                    <span className="text-foreground/60">Завершён:</span>{" "}
                    <span className="text-foreground/90">{formatDate(log.completedAt)}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              Этапы: {sessionStats.completed} / {sessionStats.total}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <CardContent className="pt-0 pb-5 px-5 space-y-4">
          <div className="rounded-md border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[44px]"></TableHead>
                  <TableHead>Этап</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Асессор</TableHead>
                  <TableHead>Начат</TableHead>
                  <TableHead>Завершён</TableHead>
                  <TableHead>Запись</TableHead>
                  <TableHead>Фидбек</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">
                      Этапы ещё не созданы
                    </TableCell>
                  </TableRow>
                ) : (
                  log.sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <SessionStatusDot status={s.status} />
                      </TableCell>
                      <TableCell className="font-medium">
                        {SESSION_TYPE_LABELS[s.type] || s.type}
                      </TableCell>
                      <TableCell className="text-xs">
                        {SESSION_STATUS_LABELS[s.status] || s.status}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.assessorName || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(s.startedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(s.completedAt)}
                      </TableCell>
                      <TableCell>
                        {s.recordingLink ? (
                          <a
                            href={s.recordingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                            Открыть
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        {s.notes ? (
                          <SessionNotes notes={s.notes} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {log.aiFeedback && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                Фидбек по ассессменту
              </p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{log.aiFeedback}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SessionNotes({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = notes.length > 140;
  const shown = expanded || !isLong ? notes : notes.slice(0, 140) + "…";
  return (
    <div className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/90">
      {shown}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-primary hover:underline"
        >
          {expanded ? "Свернуть" : "Ещё"}
        </button>
      )}
    </div>
  );
}
