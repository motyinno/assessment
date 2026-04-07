import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
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

const pdpStatusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  COMPLETED: "Завершён",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  const role = session.user.role;

  const [assessments, pdps, pendingRequestsCount, myRequests] = await Promise.all([
    prisma.assessmentParticipant.findMany({
      where: { userId },
      include: {
        assessment: {
          include: {
            participants: { include: { user: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pdp.findMany({
      where: { userId },
      include: { assessment: true },
      orderBy: { createdAt: "desc" },
    }),
    role === "ADMIN"
      ? prisma.assessmentRequest.count({ where: { status: "PENDING" } })
      : Promise.resolve(0),
    role !== "ADMIN"
      ? prisma.assessmentRequest.findMany({
          where: { userId },
          include: {
            assessor: { select: { name: true } },
            assessment: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ]);

  const myAssessments = assessments.filter((p) => p.participantRole === "SUBJECT");
  const conductingAssessments = assessments.filter((p) => p.participantRole === "ASSESSOR");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Главная</h1>
        <p className="text-muted-foreground">
          Добро пожаловать, {session.user.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Мои ассессменты
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{myAssessments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Мои ИПР
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pdps.length}</p>
          </CardContent>
        </Card>
        {(role === "ASSESSOR" || role === "ADMIN") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {role === "ADMIN" ? "Заявки на рассмотрении" : "Провожу ассессментов"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {role === "ADMIN" ? pendingRequestsCount : conductingAssessments.length}
              </p>
              {role === "ADMIN" && pendingRequestsCount > 0 && (
                <Link href="/requests" className="text-sm text-primary hover:underline">
                  Перейти к заявкам
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* My Assessments as Subject */}
      <Card>
        <CardHeader>
          <CardTitle>Мои ассессменты</CardTitle>
        </CardHeader>
        <CardContent>
          {myAssessments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет ассессментов</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Грейд</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myAssessments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.assessment.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {{ jun: "Junior", mid: "Middle", sen: "Senior" }[p.assessment.grade] || p.assessment.grade}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[p.assessment.status]}>
                        {statusLabels[p.assessment.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.assessment.scheduledAt
                        ? new Date(p.assessment.scheduledAt).toLocaleDateString("ru-RU")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/assessments/${p.assessment.id}`} className="text-sm text-primary hover:underline">
                          Открыть
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Conducting (ASSESSOR only) */}
      {(role === "ASSESSOR" || role === "ADMIN") && conductingAssessments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ассессменты которые я провожу</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Грейд</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Участники</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conductingAssessments.map((p) => {
                  const subjects = p.assessment.participants.filter(
                    (pp) => pp.participantRole === "SUBJECT"
                  );
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.assessment.title}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {{ jun: "Junior", mid: "Middle", sen: "Senior" }[p.assessment.grade] || p.assessment.grade}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[p.assessment.status]}>
                          {statusLabels[p.assessment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {subjects.map((s) => s.user.name).join(", ")}
                      </TableCell>
                      <TableCell>
                        <Link href={`/assessments/${p.assessment.id}`} className="text-sm text-primary hover:underline">
                            Открыть
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* My Requests (non-admin) */}
      {role !== "ADMIN" && myRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Мои заявки на ассессмент</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Грейд</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Асессор</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRequests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Badge variant="outline">
                        {{ jun: "Junior", mid: "Middle", sen: "Senior" }[req.grade] || req.grade}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          req.status === "APPROVED" ? "default" :
                          req.status === "REJECTED" ? "destructive" : "outline"
                        }
                      >
                        {{ PENDING: "На рассмотрении", APPROVED: "Одобрена", REJECTED: "Отклонена" }[req.status] || req.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.assessor?.name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(req.createdAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* My PDPs */}
      <Card>
        <CardHeader>
          <CardTitle>Мои ИПР</CardTitle>
        </CardHeader>
        <CardContent>
          {pdps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет планов развития</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Файл</TableHead>
                  <TableHead>Ассессмент</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата создания</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pdps.map((pdp) => (
                  <TableRow key={pdp.id}>
                    <TableCell className="font-medium">{pdp.fileName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {pdp.assessment?.title || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {pdpStatusLabels[pdp.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(pdp.createdAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell>
                      <Link href={`/api/pdps/${pdp.id}/download`} className="text-sm text-primary hover:underline">
                          Скачать
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
