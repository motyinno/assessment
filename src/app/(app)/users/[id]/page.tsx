"use client";

import { useEffect, useState } from "react";
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
import { ManagerCombobox } from "@/components/manager-combobox";
import { cn } from "@/lib/utils";

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

interface ManagerRef {
  id: string;
  name: string;
  email: string;
}

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  grade: string | null;
  project: string | null;
  managerId: string | null;
  manager: ManagerRef | null;
  participations: Participation[];
  pdps: Pdp[];
}

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

const ROLE_META: Record<string, { label: string; tone: "warning" | "default" | "secondary" | "info"; accent: string }> = {
  ADMIN: { label: "Admin", tone: "warning", accent: "from-warning/30 to-warning/10 text-warning-foreground" },
  MANAGER: { label: "Manager", tone: "info", accent: "from-info/25 to-info/5 text-info" },
  ASSESSOR: { label: "Assessor", tone: "default", accent: "from-primary/25 to-primary/5 text-primary" },
  USER: { label: "User", tone: "secondary", accent: "from-muted to-muted text-muted-foreground" },
};

const ROLE_LABEL: Record<string, string> = {
  USER: "User",
  ASSESSOR: "Assessor",
  MANAGER: "Manager",
  ADMIN: "Admin",
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
  const [editForm, setEditForm] = useState<{
    name: string;
    role: string;
    grade: string;
    project: string;
    managerId: string | null;
  }>({
    name: "",
    role: "USER",
    grade: "",
    project: "",
    managerId: null,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [managerOptions, setManagerOptions] = useState<
    Array<{ id: string; name: string; email: string; role: string }>
  >([]);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const currentRole = (session?.user as { role?: string } | undefined)?.role;
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const isAdmin = currentRole === "ADMIN";
  const isManagerOfThisUser =
    (currentRole === "MANAGER" || currentRole === "ADMIN") &&
    profile?.managerId === currentUserId;
  const canEdit = isAdmin || isManagerOfThisUser;

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN" && role !== "ASSESSOR" && role !== "MANAGER") {
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
      managerId: profile.managerId,
    });
    setEditError("");
    setEditOpen(true);
    if (managerOptions.length === 0) {
      fetch("/api/users")
        .then((r) => (r.ok ? r.json() : []))
        .then((d: Array<{ id: string; name: string; email: string; role: string }>) =>
          setManagerOptions(
            d.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))
          )
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
        body: JSON.stringify(
          isAdmin
            ? {
                name: editForm.name,
                role: editForm.role,
                grade: editForm.grade || null,
                project: editForm.project,
                managerId: editForm.managerId,
              }
            : {
                name: editForm.name,
                grade: editForm.grade || null,
                project: editForm.project,
              }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setEditOpen(false);
      await fetchProfile();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Error");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!profile) return;
    const confirmed = window.confirm(
      `Delete user ${profile.name}? This action cannot be undone.`
    );
    if (!confirmed) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/users/${profile.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      router.push("/users");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Error");
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
        throw new Error(data.error || "Failed to add");
      }
      setAttachOpen(false);
      await fetchProfile();
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Error");
    } finally {
      setAttachLoading(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (!profile) return <p className="text-destructive">User not found</p>;

  const roleMeta = ROLE_META[profile.role] ?? ROLE_META.USER;
  const completedAssessments = profile.participations.filter(
    (p) => p.assessment.status === "COMPLETED"
  ).length;
  // participations come back desc by createdAt, so .find gives the most recent.
  const latestCompletedAssessment =
    profile.participations.find(
      (p) =>
        p.assessment.status === "COMPLETED" &&
        p.assessment.assessmentType !== "PDP_CHECK"
    )?.assessment ?? null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/users" className="hover:text-foreground transition-colors">
          Users
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
                  <MetaItem label="Project" value={profile.project} />
                  <MetaItem label="Manager" value={profile.manager?.name ?? null} />
                  <MetaItem
                    label="Assessments"
                    value={`${completedAssessments} / ${profile.participations.length}`}
                  />
                  <MetaItem label="PDPs" value={String(profile.pdps.length)} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch lg:w-52 lg:shrink-0">
              {profile.grade ? (
                <Link
                  href={`/users/${profile.id}/generate-pdp`}
                  className={buttonVariants({ size: "lg" }) + " justify-center"}
                >
                  Generate PDP
                </Link>
              ) : (
                <div className="text-[11px] text-muted-foreground rounded-md border border-dashed px-3 py-2 text-center">
                  No grade — generation unavailable
                </div>
              )}
              {latestCompletedAssessment ? (
                <Link
                  href={`/assessments/${latestCompletedAssessment.id}/generate`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-auto min-h-9 py-1.5 whitespace-normal text-center leading-tight"
                  )}
                >
                  Generate PDP from assessment
                </Link>
              ) : (
                <div className="text-[11px] text-muted-foreground rounded-md border border-dashed px-3 py-2 text-center">
                  No completed assessment
                </div>
              )}
              <Button variant="outline" size="lg" onClick={openAttach}>
                Attach PDP file
              </Button>
              {canEdit && (
                <Button variant="outline" size="lg" onClick={openEdit}>
                  Edit
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleDelete}
                    disabled={deleteLoading || profile.id === currentUserId}
                    className="text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/30"
                    title={
                      profile.id === currentUserId
                        ? "Can't delete your own account"
                        : undefined
                    }
                  >
                    {deleteLoading ? "Deleting..." : "Delete"}
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
            <CardTitle>Assessments</CardTitle>
            <span className="text-xs text-muted-foreground">
              {profile.participations.length}{" "}
              {profile.participations.length === 1 ? "participation" : "participations"}
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
                <p className="text-sm font-medium">No assessments</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
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
                        {new Date(p.assessment.createdAt).toLocaleDateString("en-US")}
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
            <CardTitle>PDPs</CardTitle>
            <span className="text-xs text-muted-foreground">
              {profile.pdps.length}{" "}
              {profile.pdps.length === 1 ? "plan" : "plans"}
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
                <p className="text-sm font-medium">No development plans</p>
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
                                        Generating…
                                      </Badge>
                                    ) : isFailed ? (
                                      <Badge variant="destructive" className="shrink-0">
                                        Failed
                                      </Badge>
                                    ) : isOnReview ? (
                                      <Badge variant="warning" className="shrink-0">
                                        In review
                                      </Badge>
                                    ) : (
                                      isLatestActive && (
                                        <Badge variant="success" className="shrink-0">
                                          Current
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
                                        {new Date(pdp.createdAt).toLocaleDateString("en-US")}
                                      </Link>
                                    ) : (
                                      <span>
                                        {new Date(pdp.createdAt).toLocaleDateString("en-US")}
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
                                        Administrator notes
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
                                      title="Open in Google Drive"
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
                            ? "Hide previous"
                            : `Show previous (${older.length})`}
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

      {/* Edit user dialog */}
      {canEdit && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Edit user
                <span className="block text-sm font-normal text-muted-foreground mt-1">
                  {profile.email}
                </span>
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Role</Label>
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
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="ASSESSOR">Assessor</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {profile.id === currentUserId && (
                    <p className="text-[11px] text-muted-foreground">
                      Can't change your own role.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select
                    value={editForm.grade || "__none__"}
                    onValueChange={(v) =>
                      setEditForm({ ...editForm, grade: !v || v === "__none__" ? "" : v })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Not set">
                        {(v: unknown) =>
                          typeof v === "string" && v && v !== "__none__"
                            ? gradeLabel(v)
                            : "Not set"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not set</SelectItem>
                      {GRADE_VALUES.map((g) => (
                        <SelectItem key={g} value={g}>
                          {gradeLabel(g)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Project</Label>
                  <Input
                    value={editForm.project}
                    onChange={(e) => setEditForm({ ...editForm, project: e.target.value })}
                  />
                </div>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Manager</Label>
                  <ManagerCombobox
                    value={editForm.managerId}
                    onChange={(id) => setEditForm({ ...editForm, managerId: id })}
                    options={managerOptions}
                    excludeId={profile.id}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Only Manager / Admin users can be picked.
                  </p>
                </div>
              )}
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save"}
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
              Attach PDP by link
              <span className="block text-sm font-normal text-muted-foreground mt-1">
                {profile.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAttach} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Google Drive / Docs link</Label>
              <Input
                type="url"
                required
                placeholder="https://docs.google.com/document/d/..."
                value={attachLink}
                onChange={(e) => setAttachLink(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name (optional)</Label>
              <Input
                placeholder="e.g. PDP Q2 2026"
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
                Cancel
              </Button>
              <Button type="submit" disabled={attachLoading || !attachLink.trim()}>
                {attachLoading ? "Saving..." : "Add"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

