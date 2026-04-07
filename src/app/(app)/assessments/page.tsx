"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const isPrivileged = role === "ADMIN" || role === "ASSESSOR";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ассессменты</h1>
          <p className="text-muted-foreground">
            {isPrivileged ? "Все ассессменты" : "Мои ассессменты"}
          </p>
        </div>
        {isPrivileged && (
          <Link href="/assessments/new" className={buttonVariants()}>
            Создать ассессмент
          </Link>
        )}
      </div>

      <div className="flex gap-2">
        {["ALL", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map(
          (s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s === "ALL" ? "Все" : statusLabels[s]}
            </Button>
          )
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Нет ассессментов
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Грейд</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Участники</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const subjects = a.participants
                    .filter((p) => p.participantRole === "SUBJECT")
                    .map((p) => p.user.name);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {{ jun: "Junior", mid: "Middle", sen: "Senior" }[a.grade] || a.grade}
                        </Badge>
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
                          ? new Date(a.scheduledAt).toLocaleDateString("ru-RU")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/assessments/${a.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          Открыть
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
