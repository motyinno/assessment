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
  PENDING: "На рассмотрении",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
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
      if (!res.ok) throw new Error("Не удалось загрузить заявки");
      const data = await res.json();
      setRequests(data);
    } catch (e: unknown) {
      console.error("Ошибка загрузки заявок:", e);
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
      console.error("Ошибка загрузки профиля:", e);
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
        throw new Error(data.error || "Не удалось отправить заявку");
      }

      setNotes("");
      await fetchRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Произошла ошибка");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
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
        <h1 className="page-title">Запрос на ассессмент</h1>
        <p className="page-subtitle mt-1">
          Отправьте заявку на прохождение ассессмента — администратор рассмотрит её и назначит асессоров.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Новая заявка</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Ваш грейд</Label>
              <div className="rounded-lg border border-input bg-muted/40 px-3 py-2 text-sm">
                {userGrade ? (
                  gradeLabel(userGrade)
                ) : (
                  <span className="text-muted-foreground">
                    Грейд не указан. Обратитесь к администратору, чтобы назначить грейд перед подачей заявки.
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Дополнительная информация (необязательно)"
                rows={3}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting || !userGrade}>
              {submitting ? "Отправка..." : "Отправить заявку"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Мои заявки</h2>

        {loading ? (
          <p className="text-muted-foreground">Загрузка...</p>
        ) : requests.length === 0 ? (
          <p className="text-muted-foreground">Заявок пока нет</p>
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
                    {new Date(req.createdAt).toLocaleDateString("ru-RU", {
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
                      Ассессор: {req.assessor.name || "Не указан"}
                    </p>
                  )}

                  {req.status === "APPROVED" && req.assessment && (
                    <a
                      href={`/assessments/${req.assessment.id}`}
                      className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      Перейти к ассессменту
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
