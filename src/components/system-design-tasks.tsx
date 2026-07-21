"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SystemDesignTask {
  id: string;
  title: string;
  description: string;
  difficulty: string | null;
}

interface SystemDesignTasksProps {
  assessmentId: string;
  /** Assessors/admins/assigned managers may pick the task(s) used. */
  canAssess: boolean;
}

/**
 * The task picker for a SYSTEM_DESIGN assessment. Assessors browse the
 * admin-curated pool and tick the problem(s) they used; the selection is saved
 * to the assessment. Everyone else sees the chosen tasks read-only.
 */
export function SystemDesignTasks({
  assessmentId,
  canAssess,
}: SystemDesignTasksProps) {
  const [pool, setPool] = useState<SystemDesignTask[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    async function load() {
      const [poolRes, pickedRes] = await Promise.all([
        canAssess
          ? fetch("/api/system-design-tasks")
          : Promise.resolve(null),
        fetch(`/api/assessments/${assessmentId}/system-design-tasks`),
      ]);
      const picked: SystemDesignTask[] = pickedRes.ok
        ? await pickedRes.json()
        : [];
      const poolTasks: SystemDesignTask[] =
        poolRes && poolRes.ok ? await poolRes.json() : [];
      if (!active) return;
      // Viewers without pool access still need titles for their picked tasks.
      setPool(canAssess ? poolTasks : picked);
      setSelectedIds(new Set(picked.map((t) => t.id)));
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [assessmentId, canAssess]);

  const save = useCallback(
    async (ids: Set<string>) => {
      setSaving(true);
      try {
        const res = await fetch(
          `/api/assessments/${assessmentId}/system-design-tasks`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskIds: Array.from(ids) }),
          }
        );
        if (res.ok) setSavedAt(Date.now());
      } finally {
        setSaving(false);
      }
    },
    [assessmentId]
  );

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setSavedAt(null);
    void save(next);
  }

  function toggleExpanded(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>System design tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const selectedTasks = pool.filter((t) => selectedIds.has(t.id));

  // Read-only view for subjects and other viewers.
  if (!canAssess) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>System design tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No task selected yet.
            </p>
          ) : (
            selectedTasks.map((t) => (
              <div key={t.id} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t.title}</span>
                  {t.difficulty && (
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {t.difficulty}
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {t.description}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>System design tasks</CardTitle>
          {saving ? (
            <span className="text-xs text-muted-foreground">Saving…</span>
          ) : savedAt ? (
            <span className="text-xs text-success inline-flex items-center gap-1">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Pick the task(s) you used from the pool. Manage the pool on the{" "}
          <a href="/system-design-tasks" className="underline">
            System design tasks
          </a>{" "}
          page.
        </p>
        {pool.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The task pool is empty. Add tasks on the System design tasks page.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border">
            {pool.map((t) => {
              const checked = selectedIds.has(t.id);
              const isOpen = expanded.has(t.id);
              return (
                <li key={t.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={() => toggle(t.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.title}</span>
                        {t.difficulty && (
                          <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {t.difficulty}
                          </span>
                        )}
                        {t.description && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(t.id)}
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? "Hide" : "Details"}
                          </button>
                        )}
                      </div>
                      {isOpen && t.description && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
