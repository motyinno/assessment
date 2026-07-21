"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  title: string;
  description: string;
  difficulty: string | null;
  isArchived: boolean;
}

const textareaClass =
  "w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function SystemDesignTasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New-task form
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [creating, setCreating] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("");

  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      router.push("/dashboard");
    }
  }, [status, isAdmin, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/system-design-tasks?includeArchived=1");
    if (res.ok) setTasks(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/system-design-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          difficulty: difficulty || null,
        }),
      });
      if (res.ok) {
        setTitle("");
        setDescription("");
        setDifficulty("");
        await load();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to create task");
      }
    } finally {
      setCreating(false);
    }
  }

  function startEdit(t: Task) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditDescription(t.description);
    setEditDifficulty(t.difficulty ?? "");
  }

  async function saveEdit(id: string) {
    setError("");
    const res = await fetch(`/api/system-design-tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
        difficulty: editDifficulty || null,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save task");
    }
  }

  async function toggleArchive(t: Task) {
    setError("");
    const res = await fetch(`/api/system-design-tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: !t.isArchived }),
    });
    if (res.ok) await load();
  }

  async function deleteTask(t: Task) {
    setError("");
    if (
      !confirm(`Delete "${t.title}"? This cannot be undone.`)
    )
      return;
    const res = await fetch(`/api/system-design-tasks/${t.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await load();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to delete task");
    }
  }

  if (!isAdmin) return null;

  const active = tasks.filter((t) => !t.isArchived);
  const archived = tasks.filter((t) => t.isArchived);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="page-title">System design tasks</h1>
        <p className="page-subtitle mt-1">
          The pool of problems assessors pick from during a system-design
          assessment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a task</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createTask} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Design a URL shortener"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Difficulty (optional)</Label>
                <Input
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  placeholder="e.g. mid+"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description / prompt</Label>
              <textarea
                className={textareaClass}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Requirements, constraints, and what the candidate should cover."
              />
            </div>
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating ? "Adding…" : "Add task"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Active ({active.length})
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active tasks.</p>
            ) : (
              active.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  editing={editingId === t.id}
                  editTitle={editTitle}
                  editDescription={editDescription}
                  editDifficulty={editDifficulty}
                  onEditTitle={setEditTitle}
                  onEditDescription={setEditDescription}
                  onEditDifficulty={setEditDifficulty}
                  onStartEdit={() => startEdit(t)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={() => saveEdit(t.id)}
                  onToggleArchive={() => toggleArchive(t)}
                  onDelete={() => deleteTask(t)}
                />
              ))
            )}
          </section>

          {archived.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Archived ({archived.length})
              </h2>
              {archived.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  editing={editingId === t.id}
                  editTitle={editTitle}
                  editDescription={editDescription}
                  editDifficulty={editDifficulty}
                  onEditTitle={setEditTitle}
                  onEditDescription={setEditDescription}
                  onEditDifficulty={setEditDifficulty}
                  onStartEdit={() => startEdit(t)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={() => saveEdit(t.id)}
                  onToggleArchive={() => toggleArchive(t)}
                  onDelete={() => deleteTask(t)}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  editing: boolean;
  editTitle: string;
  editDescription: string;
  editDifficulty: string;
  onEditTitle: (v: string) => void;
  onEditDescription: (v: string) => void;
  onEditDifficulty: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

function TaskRow({
  task,
  editing,
  editTitle,
  editDescription,
  editDifficulty,
  onEditTitle,
  onEditDescription,
  onEditDifficulty,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleArchive,
  onDelete,
}: TaskRowProps) {
  return (
    <div className="rounded-md border p-4">
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => onEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Difficulty</Label>
              <Input
                value={editDifficulty}
                onChange={(e) => onEditDifficulty(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description / prompt</Label>
            <textarea
              className={textareaClass}
              value={editDescription}
              onChange={(e) => onEditDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={onSaveEdit} disabled={!editTitle.trim()}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{task.title}</span>
              {task.difficulty && (
                <Badge variant="secondary">{task.difficulty}</Badge>
              )}
              {task.isArchived && <Badge variant="outline">Archived</Badge>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={onStartEdit}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onToggleArchive}>
                {task.isArchived ? "Unarchive" : "Archive"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={onDelete}
              >
                Delete
              </Button>
            </div>
          </div>
          {task.description && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
