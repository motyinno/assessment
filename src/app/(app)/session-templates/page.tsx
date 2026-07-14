"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/confirm-dialog";
import { ASSESSMENT_TYPE_LABELS } from "@/lib/assessment-sessions";

interface SessionTemplate {
  id: string;
  assessmentType: "GENERAL" | "PDP_CHECK";
  gradeBand: "jun" | "mid" | "sen";
  key: string;
  title: string;
  order: number;
  durationMin: number;
  enabled: boolean;
}

const GRADE_BANDS = ["jun", "mid", "sen"] as const;
const ASSESSMENT_TYPES = ["GENERAL", "PDP_CHECK"] as const;
const BAND_LABELS: Record<string, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

type GroupBy = "grade" | "type";

type FormState = {
  assessmentType: "GENERAL" | "PDP_CHECK";
  gradeBand: "jun" | "mid" | "sen";
  title: string;
  durationMin: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  assessmentType: "GENERAL",
  gradeBand: "jun",
  title: "",
  durationMin: "60",
  enabled: true,
};

export default function SessionTemplatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("grade");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SessionTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { confirm, confirmDialog } = useConfirm();

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      router.push("/dashboard");
      return;
    }
    fetchTemplates();
  }, [status, isAdmin, router]);

  async function fetchTemplates() {
    const res = await fetch("/api/session-templates");
    if (res.ok) setTemplates(await res.json());
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setOpen(true);
  }

  function openEdit(t: SessionTemplate) {
    setEditing(t);
    setForm({
      assessmentType: t.assessmentType,
      gradeBand: t.gradeBand,
      title: t.title,
      durationMin: String(t.durationMin),
      enabled: t.enabled,
    });
    setError("");
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const durationMin = Number(form.durationMin);
    if (!Number.isFinite(durationMin) || durationMin < 1) {
      setError("Duration must be a positive number of minutes");
      setSaving(false);
      return;
    }

    let res: Response;
    if (editing) {
      // Type / grade band are fixed once created; only title, duration &
      // enabled state change.
      res = await fetch(`/api/session-templates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          durationMin,
          enabled: form.enabled,
        }),
      });
    } else {
      const siblings = templates.filter(
        (t) =>
          t.assessmentType === form.assessmentType &&
          t.gradeBand === form.gradeBand
      );
      const order = siblings.length;
      res = await fetch("/api/session-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assessmentType: form.assessmentType,
          gradeBand: form.gradeBand,
          title: form.title,
          durationMin,
          order,
          enabled: form.enabled,
        }),
      });
    }

    setSaving(false);
    if (res.ok) {
      setOpen(false);
      fetchTemplates();
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message || "Failed to save session template");
    }
  }

  async function toggleEnabled(t: SessionTemplate, enabled: boolean) {
    // Optimistic update.
    setTemplates((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, enabled } : x))
    );
    const res = await fetch(`/api/session-templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) fetchTemplates(); // revert to server truth on failure
  }

  async function handleDelete(t: SessionTemplate) {
    const ok = await confirm({
      title: `Delete “${t.title}”?`,
      description: `Removes this session from ${ASSESSMENT_TYPE_LABELS[t.assessmentType]} · ${BAND_LABELS[t.gradeBand]}. To keep it but skip it, toggle it off instead.`,
      confirmLabel: "Delete session",
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/session-templates/${t.id}`, {
      method: "DELETE",
    });
    if (res.ok) fetchTemplates();
  }

  const rowsFor = (
    assessmentType: "GENERAL" | "PDP_CHECK",
    gradeBand: "jun" | "mid" | "sen"
  ) =>
    templates
      .filter(
        (t) => t.assessmentType === assessmentType && t.gradeBand === gradeBand
      )
      .sort((a, b) => a.order - b.order);

  // Two-level grouping. Outer dimension follows `groupBy`; the inner cards are
  // the other dimension. Default outer = grade band.
  const outerGroups = useMemo(() => {
    if (groupBy === "grade") {
      return GRADE_BANDS.map((gradeBand) => ({
        key: gradeBand,
        label: BAND_LABELS[gradeBand],
        subs: ASSESSMENT_TYPES.map((assessmentType) => ({
          assessmentType,
          gradeBand,
          label: ASSESSMENT_TYPE_LABELS[assessmentType],
          rows: rowsFor(assessmentType, gradeBand),
        })),
      }));
    }
    return ASSESSMENT_TYPES.map((assessmentType) => ({
      key: assessmentType,
      label: ASSESSMENT_TYPE_LABELS[assessmentType],
      subs: GRADE_BANDS.map((gradeBand) => ({
        assessmentType,
        gradeBand,
        label: BAND_LABELS[gradeBand],
        rows: rowsFor(assessmentType, gradeBand),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, groupBy]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Session templates</h1>
          <p className="page-subtitle mt-1">
            Configure how many sessions and which types are generated for new
            assessments, per grade band. Toggle a session off to skip it without
            deleting it.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="lg" onClick={openCreate} />}>
            Add session
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit session" : "New session template"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assessment type</Label>
                  <Select
                    value={form.assessmentType}
                    onValueChange={(v) =>
                      v &&
                      setForm({
                        ...form,
                        assessmentType: v as FormState["assessmentType"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full" disabled={!!editing}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSESSMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ASSESSMENT_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Grade band</Label>
                  <Select
                    value={form.gradeBand}
                    onValueChange={(v) =>
                      v &&
                      setForm({
                        ...form,
                        gradeBand: v as FormState["gradeBand"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full" disabled={!!editing}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADE_BANDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BAND_LABELS[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Session name / type</Label>
                <Input
                  value={form.title}
                  placeholder="e.g. Technical 1, Live Coding, System Design…"
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  max={480}
                  value={form.durationMin}
                  onChange={(e) =>
                    setForm({ ...form, durationMin: e.target.value })
                  }
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm({ ...form, enabled: e.target.checked })
                  }
                />
                Enabled (included when generating sessions)
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Add session"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Grouping toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Group by</span>
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          <Button
            variant={groupBy === "grade" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setGroupBy("grade")}
          >
            Grade
          </Button>
          <Button
            variant={groupBy === "type" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setGroupBy("type")}
          >
            Assessment type
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {outerGroups.map((outer) => (
          <div key={outer.key} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {outer.label}
            </h2>
            <div className="space-y-4">
              {outer.subs.map((sub) => (
                <Card key={`${sub.assessmentType}:${sub.gradeBand}`}>
                  <CardContent className="p-0">
                    <div className="flex items-center gap-2 border-b px-4 py-3">
                      <Badge
                        variant={
                          groupBy === "grade" ? "default" : "outline"
                        }
                      >
                        {sub.label}
                      </Badge>
                      {(() => {
                        const on = sub.rows.filter((r) => r.enabled).length;
                        const off = sub.rows.length - on;
                        return (
                          <span className="ml-1 flex items-center gap-2 text-sm">
                            <span className="font-semibold text-foreground">
                              {on}
                            </span>
                            <span className="text-muted-foreground">
                              session{on === 1 ? "" : "s"} will be created
                            </span>
                            {off > 0 && (
                              <span className="text-xs text-muted-foreground">
                                · {off} off
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </div>
                    {sub.rows.length === 0 ? (
                      <p className="px-4 py-4 text-sm text-muted-foreground">
                        No sessions — new assessments fall back to built-in
                        defaults.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">On</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Key</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead className="text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sub.rows.map((t) => (
                            <TableRow
                              key={t.id}
                              className={t.enabled ? "" : "opacity-55"}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="size-4 accent-primary"
                                  checked={t.enabled}
                                  onChange={(e) =>
                                    toggleEnabled(t, e.target.checked)
                                  }
                                  aria-label={`Enable ${t.title}`}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                {t.title}
                                {!t.enabled && (
                                  <span className="ml-2 text-[11px] text-muted-foreground">
                                    (off)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <code className="text-xs text-muted-foreground">
                                  {t.key}
                                </code>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {t.durationMin} min
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEdit(t)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDelete(t)}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {confirmDialog}
    </div>
  );
}
