"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AssessmentProgress } from "@/components/assessment-progress";
import { SESSION_TYPE_LABELS, SESSION_STATUS_LABELS } from "@/lib/assessment-sessions";
import { AssessmentMatrix } from "@/components/assessment-matrix";

const statusLabels: Record<string, string> = {
  PLANNED: "Запланирован",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершён",
  CANCELLED: "Отменён",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PLANNED: "outline",
  IN_PROGRESS: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

const gradeLabels: Record<string, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

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
}

interface Assessment {
  id: string;
  title: string;
  status: string;
  grade: string;
  scheduledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  createdAt: string;
  participants: Array<{
    id: string;
    participantRole: string;
    assignedSections: string | null;
    user: { id: string; name: string; email: string };
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
    user: { id: string; name: string };
  }>;
  sessions: SessionInfo[];
}

export default function AssessmentDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionActionLoading, setSessionActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);

  const id = params.id as string;
  const role = session?.user?.role;
  const isAssessor = role === "ASSESSOR" || role === "ADMIN";

  useEffect(() => {
    fetchAssessment();
  }, [id]);

  async function fetchAssessment() {
    const res = await fetch(`/api/assessments/${id}`);
    if (res.ok) {
      setAssessment(await res.json());
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

  async function handleSessionAction(sessionId: string, action: "start" | "complete") {
    setSessionActionLoading(true);
    const newStatus = action === "start" ? "IN_PROGRESS" : "COMPLETED";
    const res = await fetch(`/api/assessments/${id}/sessions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, status: newStatus }),
    });
    if (res.ok) {
      await fetchAssessment();
    }
    setSessionActionLoading(false);
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
        setFeedback(data.generalFeedback);
      } else {
        const error = await res.json();
        alert(error.error || "Ошибка генерации фидбека");
      }
    } catch (error) {
      alert("Ошибка генерации фидбека");
    }
    setGeneratingFeedback(false);
  }

  if (loading)
    return <p className="text-muted-foreground">Загрузка...</p>;
  if (!assessment)
    return <p className="text-destructive">Ассессмент не найден</p>;

  const subjects = assessment.participants.filter(
    (p) => p.participantRole === "SUBJECT"
  );
  const assessors = assessment.participants.filter(
    (p) => p.participantRole === "ASSESSOR"
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{assessment.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={statusVariants[assessment.status]}>
              {statusLabels[assessment.status]}
            </Badge>
            <Badge variant="outline">
              {gradeLabels[assessment.grade] || assessment.grade}
            </Badge>
          </div>
        </div>

        {isAssessor && (
          <div className="flex gap-2">
            {assessment.status === "COMPLETED" && (
              <Link href={`/assessments/${id}/generate`} className={buttonVariants()}>
                Сгенерировать ИПР
              </Link>
            )}
            {assessment.status !== "CANCELLED" &&
              assessment.status !== "COMPLETED" && (
                <Button
                  variant="destructive"
                  onClick={() => updateStatus("CANCELLED")}
                >
                  Отменить
                </Button>
              )}
          </div>
        )}
      </div>

      {/* Session Progress */}
      {hasSessions && (
        <AssessmentProgress
          sessions={assessment.sessions}
          isAssessor={isAssessor}
          onSessionAction={handleSessionAction}
          loading={sessionActionLoading}
        />
      )}

      {/* Lazy session creation for old assessments */}
      {canCreateSessions && isAssessor && (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Для этого ассессмента ещё не созданы сессии
            </p>
            <Button onClick={createSessions} disabled={sessionActionLoading}>
              Создать сессии
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Info */}
        <Card>
          <CardHeader>
            <CardTitle>Информация</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Дата создания</span>
              <span>{new Date(assessment.createdAt).toLocaleDateString("ru-RU")}</span>
            </div>
            {assessment.scheduledAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Запланирован на</span>
                <span>
                  {new Date(assessment.scheduledAt).toLocaleDateString("ru-RU")}
                </span>
              </div>
            )}
            {assessment.completedAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Завершён</span>
                <span>
                  {new Date(assessment.completedAt).toLocaleDateString("ru-RU")}
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
            <CardTitle>Участники</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subjects.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Оцениваемые
                </p>
                {subjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <span className="text-sm">{p.user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.user.email}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {assessors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                  Асессоры
                </p>
                {assessors.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 py-1">
                    <span className="text-sm">{p.user.name}</span>
                    {p.assignedSections && (
                      <span className="text-xs text-muted-foreground">
                        ({JSON.parse(p.assignedSections).join(", ")})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Session History */}
      {hasSessions && assessment.sessions.some((s) => s.status === "COMPLETED" || s.status === "IN_PROGRESS") && (
        <Card>
          <CardHeader>
            <CardTitle>История проведения</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Этап</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Асессор</TableHead>
                  <TableHead>Начало</TableHead>
                  <TableHead>Завершение</TableHead>
                  <TableHead>Длительность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessment.sessions
                  .filter((s) => s.status !== "NOT_STARTED")
                  .map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {SESSION_TYPE_LABELS[s.type] || s.type}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            s.status === "COMPLETED" ? "secondary" :
                            s.status === "IN_PROGRESS" ? "default" :
                            s.status === "SKIPPED" ? "outline" : "outline"
                          }
                        >
                          {SESSION_STATUS_LABELS[s.status] || s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.assessorName || (s.status === "SKIPPED" ? "—" : "Не назначен")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.startedAt
                          ? new Date(s.startedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.completedAt
                          ? new Date(s.completedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.startedAt && s.completedAt
                          ? `${Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 60000)} мин.`
                          : s.status === "SKIPPED" ? "Пропущена" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tech Matrix with Self-Assessment */}
      {assessment.status !== "CANCELLED" && (
        <AssessmentMatrix
          assessmentId={assessment.id}
          grade={assessment.grade}
          isSubject={isSubject}
          isAssessor={isAssessor}
        />
      )}

      {/* AI Feedback Generation */}
      {assessment.status === "COMPLETED" && isAssessor && (
        <Card>
          <CardHeader>
            <CardTitle>AI Фидбек</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!feedback ? (
              <Button
                onClick={generateFeedback}
                disabled={generatingFeedback}
                className="w-full"
              >
                {generatingFeedback ? "Генерация..." : "Сгенерировать фидбек через AI"}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    onClick={generateFeedback}
                    disabled={generatingFeedback}
                    variant="outline"
                    size="sm"
                  >
                    {generatingFeedback ? "Генерация..." : "Перегенерировать"}
                  </Button>
                  <Button
                    onClick={() => setFeedback(null)}
                    variant="ghost"
                    size="sm"
                  >
                    Скрыть
                  </Button>
                </div>
                <div className="prose prose-sm max-w-none p-4 bg-muted/50 rounded-lg">
                  {feedback.split('\n').map((paragraph, idx) => (
                    <p key={idx} className="mb-2">{paragraph}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}


      {/* PDPs */}
      {assessment.pdps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Планы развития</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessment.pdps.map((pdp) => (
                  <TableRow key={pdp.id}>
                    <TableCell className="font-medium">{pdp.fileName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {pdp.user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(pdp.createdAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <Link href={`/api/pdps/${pdp.id}/download`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        Скачать
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={() => router.push("/assessments")}>
        Назад к списку
      </Button>
    </div>
  );
}
