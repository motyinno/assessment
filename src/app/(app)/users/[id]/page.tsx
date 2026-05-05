"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { gradeLabel, GRADE_VALUES } from "@/lib/grades";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSESSMENT_TYPE_LABELS } from "@/lib/assessment-sessions";

interface Assessment {
  id: string;
  title: string;
  status: string;
  grade: string;
  assessmentType: string;
  createdAt: string;
  completedAt: string | null;
}

interface Participation {
  id: string;
  participantRole: string;
  assessment: Assessment;
}

interface Pdp {
  id: string;
  fileName: string;
  createdAt: string;
  driveLink: string | null;
  status: string;
  error: string | null;
  reviewNotes: string | null;
  assessment: { id: string; title: string } | null;
}

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  grade: string | null;
  project: string | null;
  manager: string | null;
  participations: Participation[];
  pdps: Pdp[];
}

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

const ROLE_META: Record<string, { label: string; tone: "warning" | "default" | "secondary"; accent: string }> = {
  ADMIN: { label: "Админ", tone: "warning", accent: "from-warning/30 to-warning/10 text-warning-foreground" },
  ASSESSOR: { label: "Асессор", tone: "default", accent: "from-primary/25 to-primary/5 text-primary" },
  USER: { label: "Пользователь", tone: "secondary", accent: "from-muted to-muted text-muted-foreground" },
};

const ROLE_LABEL: Record<string, string> = {
  USER: "Пользователь",
  ASSESSOR: "Асессор",
  ADMIN: "Админ",
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground uppercase tracking-wide text-[10px]">
        {label}
      </p>
      <p className="text-foreground truncate mt-0.5">{value || "—"}</p>
    </div>
  );
}

export default function UserProfilePage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachLink, setAttachLink] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachError, setAttachError] = useState("");
  const [pdpsExpanded, setPdpsExpanded] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    role: "USER",
    grade: "",
    project: "",
    manager: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [managerOptions, setManagerOptions] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const currentRole = (session?.user as { role?: string } | undefined)?.role;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = currentRole === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN" && role !== "ASSESSOR") {
      router.push("/dashboard");
      return;
    }
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status, userId]);

  // Poll while any PDP is still generating
  useEffect(() => {
    if (!profile) return;
    const hasGenerating = profile.pdps.some((p) => p.status === "GENERATING");
    if (!hasGenerating) return;
    const t = setInterval(fetchProfile, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function fetchProfile() {
    const res = await fetch(`/api/users/${userId}`);
    if (res.ok) {
      setProfile(await res.json());
    }
    setLoading(false);
  }

  function openEdit() {
    if (!profile) return;
    setEditForm({
      name: profile.name,
      role: profile.role,
      grade: profile.grade ?? "",
      project: profile.project ?? "",
      manager: profile.manager ?? "",
    });
    setEditError("");
    setEditOpen(true);
    if (managerOptions.length === 0) {
      fetch("/api/users")
        .then((r) => (r.ok ? r.json() : []))
        .then((d: Array<{ id: string; name: string; email: string }>) =>
          setManagerOptions(d.map((u) => ({ id: u.id, name: u.name, email: u.email })))
        )
        .catch(() => {});
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setEditError("");
    setEditLoading(true);
    try {
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          role: editForm.role,
          grade: editForm.grade || null,
          project: editForm.project,
          manager: editForm.manager,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось сохранить");
      }
      setEditOpen(false);
      await fetchProfile();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    const confirmed = window.confirm(
      `Удалить пользователя ${profile.name}? Это действие нельзя отменить.`
    );
    if (!confirmed) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/users/${profile.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось удалить");
      }
      router.push("/users");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Ошибка");
      setDeleteLoading(false);
    }
  }

  function openAttach() {
    setAttachLink("");
    setAttachName("");
    setAttachError("");
    setAttachOpen(true);
  }

  async function submitAttach(e: React.FormEvent) {
    e.preventDefault();
    setAttachError("");
    setAttachLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/attach-pdp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveLink: attachLink,
          fileName: attachName || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось добавить");
      }
      setAttachOpen(false);
      await fetchProfile();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setAttachLoading(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Загрузка...</p>;
  if (!profile) return <p className="text-destructive">Пользователь не найден</p>;

  const roleMeta = ROLE_META[profile.role] ?? ROLE_META.USER;
  const completedAssessments = profile.participations.filter(
    (p) => p.assessment.status === "COMPLETED"
  ).length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/users" className="hover:text-foreground transition-colors">
          Пользователи
        </Link>
        <span>/</span>
        <span className="text-foreground/70 truncate">{profile.name}</span>
      </div>

      {/* Identity banner with all meta + actions */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-5">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div
                className={`w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br ${roleMeta.accent} flex items-center justify-center text-lg font-semibold ring-1 ring-border/50`}
              >
                {initialsOf(profile.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight truncate">
                    {profile.name}
                  </h1>
                  <Badge variant={roleMeta.tone}>{roleMeta.label}</Badge>
                  {profile.grade && (
                    <Badge variant="outline">{gradeLabel(profile.grade)}</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {profile.email}
                </p>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                  <MetaItem label="Проект" value={profile.project} />
                  <MetaItem label="Руководитель" value={profile.manager} />
                  <MetaItem
                    label="Ассессменты"
                    value={`${completedAssessments} / ${profile.participations.length}`}
                  />
                  <MetaItem label="ИПР" value={String(profile.pdps.length)} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch lg:w-52 lg:shrink-0">
              {profile.grade ? (
                <Link
                  href={`/users/${profile.id}/generate-pdp`}
                  className={buttonVariants({ size: "lg" }) + " justify-center"}
                >
                  Сгенерировать ИПР
                </Link>
              ) : (
                <div className="text-[11px] text-muted-foreground rounded-md border border-dashed px-3 py-2 text-center">
                  Без грейда — генерация недоступна
                </div>
              )}
              <Button variant="outline" size="lg" onClick={openAttach}>
                Добавить PDP файл
              </Button>
              {isAdmin && (
                <>
                  <Button variant="outline" size="lg" onClick={openEdit}>
                    Редактировать
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleDelete}
                    disabled={deleteLoading || profile.id === currentUserId}
                    className="text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/30"
                    title={
                      profile.id === currentUserId
                        ? "Нельзя удалить свой аккаунт"
                        : undefined
                    }
                  >
                    {deleteLoading ? "Удаление..." : "Удалить"}
                  </Button>
                  {deleteError && (
                    <p className="text-xs text-destructive">{deleteError}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assessments + PDPs side-by-side on large screens */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Ассессменты</CardTitle>
            <span className="text-xs text-muted-foreground">
              {profile.participations.length}{" "}
              {profile.participations.length === 1 ? "участие" : "участий"}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {profile.participations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                  </svg>
                </div>
                <p className="text-sm font-medium">Нет ассессментов</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Название</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.participations.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/assessments/${p.assessment.id}`)}
                    >
                      <TableCell className="font-medium">
                        <span className="hover:text-primary transition-colors">
                          {p.assessment.title}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.assessment.assessmentType === "PDP_CHECK" ? "info" : "secondary"}>
                          {ASSESSMENT_TYPE_LABELS[p.assessment.assessmentType] || p.assessment.assessmentType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[p.assessment.status]}>
                          {statusLabels[p.assessment.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(p.assessment.createdAt).toLocaleDateString("ru-RU")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>ИПР</CardTitle>
            <span className="text-xs text-muted-foreground">
              {profile.pdps.length}{" "}
              {profile.pdps.length === 1 ? "план" : "планов"}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {profile.pdps.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <p className="text-sm font-medium">Нет планов развития</p>
              </div>
            ) : (
              (() => {
                const sortedPdps = [...profile.pdps].sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                );
                const [latest, ...older] = sortedPdps;
                const visible = pdpsExpanded ? sortedPdps : [latest];
                const latestActiveId = sortedPdps.find(
                  (p) => p.status === "ACTIVE"
                )?.id;
                const activeCount = sortedPdps.filter(
                  (p) => p.status === "ACTIVE"
                ).length;

                return (
                  <>
                    <ul className="divide-y divide-border">
                      {visible.map((pdp) => {
                        const isLatestActive =
                          pdp.id === latestActiveId && activeCount > 1;
                        const isGenerating = pdp.status === "GENERATING";
                        const isFailed = pdp.status === "FAILED";
                        const isOnReview = pdp.status === "ON_REVIEW";
                        return (
                          <li
                            key={pdp.id}
                            className="px-5 py-3 flex items-start gap-3"
                          >
                            <div
                              className={
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 " +
                                (isFailed
                                  ? "bg-destructive/10 text-destructive"
                                  : isGenerating
                                    ? "bg-info/15 text-info"
                                    : isOnReview
                                      ? "bg-warning/20 text-warning-foreground"
                                      : "bg-primary/10 text-primary")
                              }
                            >
                              {isGenerating ? (
                                <svg
                                  className="w-4 h-4 animate-spin"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                              ) : isFailed ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate" title={pdp.fileName}>
                                    {pdp.fileName}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                                    {isGenerating ? (
                                      <Badge variant="info" className="shrink-0">
                                        Генерация…
                                      </Badge>
                                    ) : isFailed ? (
                                      <Badge variant="destructive" className="shrink-0">
                                        Ошибка
                                      </Badge>
                                    ) : isOnReview ? (
                                      <Badge variant="warning" className="shrink-0">
                                        На проверке
                                      </Badge>
                                    ) : (
                                      isLatestActive && (
                                        <Badge variant="success" className="shrink-0">
                                          Актуальный
                                        </Badge>
                                      )
                                    )}
                                    {pdp.assessment ? (
                                      <Link
                                        href={`/assessments/${pdp.assessment.id}`}
                                        className="inline-flex items-center gap-1 text-primary hover:underline truncate"
                                        title={pdp.assessment.title}
                                      >
                                        <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M7 17L17 7" />
                                          <polyline points="7 7 17 7 17 17" />
                                        </svg>
                                        {new Date(pdp.createdAt).toLocaleDateString("ru-RU")}
                                      </Link>
                                    ) : (
                                      <span>
                                        {new Date(pdp.createdAt).toLocaleDateString("ru-RU")}
                                      </span>
                                    )}
                                  </div>
                                  {isFailed && pdp.error && (
                                    <p className="text-[11px] text-destructive mt-1 truncate" title={pdp.error}>
                                      {pdp.error}
                                    </p>
                                  )}
                                  {isOnReview && pdp.reviewNotes && (
                                    <div className="mt-1.5 rounded-md bg-warning/10 border border-warning/30 px-2.5 py-1.5">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-warning-foreground/80">
                                        Замечания администратора
                                      </p>
                                      <p className="text-[11px] text-foreground whitespace-pre-wrap mt-0.5">
                                        {pdp.reviewNotes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!isGenerating && !isFailed && pdp.driveLink && (
                                    <a
                                      href={pdp.driveLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Открыть в Google Drive"
                                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 px-2 py-1 rounded-md"
                                    >
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                      </svg>
                                      Drive
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {older.length > 0 && (
                      <div className="border-t px-5 py-2">
                        <button
                          type="button"
                          onClick={() => setPdpsExpanded((v) => !v)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${pdpsExpanded ? "rotate-180" : ""}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                          {pdpsExpanded
                            ? "Скрыть предыдущие"
                            : `Показать предыдущие (${older.length})`}
                        </button>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit user dialog (admin only) */}
      {isAdmin && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Редактировать пользователя
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {profile.email}
                </span>
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Имя</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Роль</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) => v && setEditForm({ ...editForm, role: v })}
                  disabled={profile.id === currentUserId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v: unknown) => (typeof v === "string" ? ROLE_LABEL[v] ?? v : "")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">Пользователь</SelectItem>
                    <SelectItem value="ASSESSOR">Асессор</SelectItem>
                    <SelectItem value="ADMIN">Админ</SelectItem>
                  </SelectContent>
                </Select>
                {profile.id === currentUserId && (
                  <p className="text-[11px] text-muted-foreground">
                    Нельзя сменить собственную роль.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Грейд</Label>
                  <Select
                    value={editForm.grade || "__none__"}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, grade: !v || v === "__none__" ? "" : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Не задан">
                        {(v: unknown) =>
                          typeof v === "string" && v && v !== "__none__"
                            ? gradeLabel(v)
                            : "Не задан"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Не задан</SelectItem>
                      {GRADE_VALUES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {gradeLabel(g)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Проект</Label>
                  <Input
                    value={editForm.project}
                    onChange={(e) => setEditForm({ ...editForm, project: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Руководитель</Label>
                <ManagerCombobox
                  value={editForm.manager}
                  onChange={(v) => setEditForm({ ...editForm, manager: v })}
                  options={managerOptions}
                  excludeId={profile.id}
                />
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Attach-by-link dialog */}
      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Добавить ИПР по ссылке
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                {profile.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAttach} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ссылка на Google Drive / Docs</Label>
              <Input
                type="url"
                required
                placeholder="https://docs.google.com/document/d/..."
                value={attachLink}
                onChange={(e) => setAttachLink(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Название (необязательно)</Label>
              <Input
                placeholder="Например: ИПР Q2 2026"
                value={attachName}
                onChange={(e) => setAttachName(e.target.value)}
              />
            </div>
            {attachError && (
              <p className="text-sm text-destructive">{attachError}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAttachOpen(false)}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={attachLoading || !attachLink.trim()}>
                {attachLoading ? "Сохранение..." : "Добавить"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManagerCombobox({
  value,
  onChange,
  options,
  excludeId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string; email: string }>;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const query = value.trim().toLowerCase();
  const matches = options
    .filter((u) => u.id !== excludeId)
    .filter((u) => {
      if (!query) return true;
      return (
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    })
    .slice(0, 8);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function selectOption(opt: { name: string }) {
    onChange(opt.name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            setOpen(true);
            return;
          }
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && matches[highlighted]) {
            e.preventDefault();
            selectOption(matches[highlighted]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Начните вводить имя или email"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-md ring-1 ring-foreground/5"
          role="listbox"
        >
          {matches.map((opt, idx) => {
            const active = idx === highlighted;
            return (
              <li
                key={opt.id}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption(opt);
                }}
                onMouseEnter={() => setHighlighted(idx)}
                className={
                  "px-3 py-1.5 cursor-pointer text-sm " +
                  (active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")
                }
              >
                <div className="font-medium truncate">{opt.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{opt.email}</div>
              </li>
            );
          })}
        </ul>
      )}
      {value && !matches.some((m) => m.name === value) && (
        <p className="text-[11px] text-muted-foreground mt-1">
          Если руководителя нет в списке, значение будет сохранено как есть.
        </p>
      )}
    </div>
  );
}
