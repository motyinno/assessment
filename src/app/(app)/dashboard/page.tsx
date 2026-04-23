import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { gradeLabel } from "@/lib/grades";

type StatTone = "primary" | "success" | "warning" | "muted";

const TONE_STYLES: Record<StatTone, { icon: string; ring: string }> = {
  primary: { icon: "bg-primary/10 text-primary", ring: "ring-primary/10" },
  success: { icon: "bg-success/15 text-success", ring: "ring-success/10" },
  warning: { icon: "bg-warning/20 text-warning-foreground", ring: "ring-warning/20" },
  muted: { icon: "bg-muted text-muted-foreground", ring: "ring-border" },
};

function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  footer,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: StatTone;
  footer?: React.ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <Card className={cn("card-hover", styles.ring)}>
      <CardContent className="flex items-start justify-between gap-4 pt-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {footer}
        </div>
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", styles.icon)}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
    </div>
  );
}
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

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "info" | "warning"> = {
  PLANNED: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
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

  const firstName = session.user.name?.split(" ")[0] ?? session.user.name;

  return (
    <div className="space-y-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Привет, {firstName} 👋</h1>
          <p className="page-subtitle mt-1">
            Обзор ваших ассессментов и планов развития
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Мои ассессменты"
          value={myAssessments.length}
          tone="primary"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label="Мои ИПР"
          value={pdps.length}
          tone="success"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="13" y2="17" />
            </svg>
          }
        />
        {(role === "ASSESSOR" || role === "ADMIN") && (
          <StatCard
            label={role === "ADMIN" ? "Заявки на рассмотрении" : "Провожу ассессментов"}
            value={role === "ADMIN" ? pendingRequestsCount : conductingAssessments.length}
            tone={role === "ADMIN" && pendingRequestsCount > 0 ? "warning" : "muted"}
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            }
            footer={
              role === "ADMIN" && pendingRequestsCount > 0 ? (
                <Link href="/requests" className="text-xs font-medium text-primary hover:underline">
                  Перейти к заявкам →
                </Link>
              ) : null
            }
          />
        )}
      </div>

      {/* My Assessments as Subject */}
      <Card>
        <CardHeader>
          <CardTitle>Мои ассессменты</CardTitle>
        </CardHeader>
        <CardContent>
          {myAssessments.length === 0 ? (
            <EmptyState title="Нет ассессментов" description="Когда вам назначат ассессмент, он появится здесь." />
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
                        {gradeLabel(p.assessment.grade)}
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
                          {gradeLabel(p.assessment.grade)}
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
                        {gradeLabel(req.grade)}
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
            <EmptyState title="Нет планов развития" description="ИПР появятся после завершения ассессмента." />
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
                    <TableCell className="space-x-3 whitespace-nowrap">
                      {pdp.driveLink && (
                        <a
                          href={pdp.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Открыть в Drive
                        </a>
                      )}
                      {pdp.filePath && (
                        <Link
                          href={`/api/pdps/${pdp.id}/download`}
                          className="text-sm text-primary hover:underline"
                        >
                          Скачать
                        </Link>
                      )}
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
