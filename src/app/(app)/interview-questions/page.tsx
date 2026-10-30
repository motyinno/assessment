"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiErrorMessage } from "@/lib/api-error";
import { QuestionImportFormat } from "@/components/question-import-format";

type Kind = "THEORY" | "EXPERIENCE" | "BEHAVIORAL" | "BACKGROUND";
const KIND_LABEL: Record<Kind, string> = { THEORY: "Theory", EXPERIENCE: "Experience", BEHAVIORAL: "Behavioral", BACKGROUND: "Background" };
const BAND_LABEL: Record<string, string> = { jun: "Junior", mid: "Middle", sen: "Senior" };

interface Division {
  id: string;
  name: string;
}
interface Question {
  id: string;
  text: string;
  kind: Kind;
  band: string | null;
  topicId: string | null;
  proposedTopic: string | null;
  timesAsked: number;
  hidden: boolean;
}
interface SkillSuggestion {
  topicId: string;
  title: string;
  sectionTitle: string;
  skills: Array<{ skill: string; questions: number; asked: number }>;
}
interface Summary {
  topics: Array<{ id: string; title: string; sectionTitle: string; theory: number; experience: number; other: number; total: number }>;
  proposed: Array<{ title: string; count: number }>;
  totals: Array<{ kind: Kind; hidden: boolean; count: number }>;
  imports: Array<{
    id: string;
    title: string;
    stats: { received?: number; created?: number; merged?: number; unknownTopics?: number; toMap?: number };
    status: "PROCESSING" | "DONE" | "FAILED";
    mapTotal: number;
    mapDone: number;
    error: string | null;
    createdAt: string;
    createdBy: { name: string } | null;
  }>;
}

/**
 * Admin: the division's interview question bank — import, overview per
 * matrix topic, topics the matrix lacks, and a filterable list to re-attach,
 * re-level or hide questions (lib/question-bank.ts).
 */
export default function InterviewQuestionsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isSuperAdmin = !!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [suggestions, setSuggestions] = useState<SkillSuggestion[] | null>(null);
  const [items, setItems] = useState<Question[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ topicId: "", kind: "", band: "", q: "", hidden: false });
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; issues?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetch("/api/tech-matrix/divisions")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { divisions: Division[]; own: Division | null } | null) => {
        if (!d) return;
        setDivisions(d.divisions);
        setDivisionId(d.own?.id ?? d.divisions[0]?.id ?? "");
      });
  }, [status, role, router]);

  const qs = useCallback(
    (extra: Record<string, string> = {}) => new URLSearchParams({ departmentId: divisionId, ...extra }).toString(),
    [divisionId]
  );

  const loadSummary = useCallback(async () => {
    if (!divisionId) return;
    const r = await fetch(`/api/interview-questions/summary?${qs()}`);
    if (r.ok) setSummary(await r.json());
  }, [divisionId, qs]);

  const loadSuggestions = useCallback(async () => {
    if (!divisionId) return;
    const r = await fetch(`/api/interview-questions/suggested-skills?${qs()}`);
    if (r.ok) setSuggestions((await r.json()).topics);
  }, [divisionId, qs]);

  async function decideSkill(body: Record<string, unknown>) {
    const r = await fetch("/api/interview-questions/suggested-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setMessage({ tone: "error", text: apiErrorMessage(await r.json().catch(() => null), "Couldn't update the matrix") });
      return;
    }
    if (body.action === "accept") setMessage({ tone: "ok", text: `Added “${body.skill}” to the matrix.` });
    await loadSuggestions();
  }

  const loadItems = useCallback(async () => {
    if (!divisionId) return;
    const extra: Record<string, string> = { page: String(page) };
    if (filters.topicId) extra.topicId = filters.topicId;
    if (filters.kind) extra.kind = filters.kind;
    if (filters.band) extra.band = filters.band;
    if (filters.q.trim()) extra.q = filters.q.trim();
    if (filters.hidden) extra.hidden = "1";
    const r = await fetch(`/api/interview-questions?${qs(extra)}`);
    if (!r.ok) return;
    const d = await r.json();
    setItems(d.items);
    setTotal(d.total);
  }, [divisionId, qs, page, filters]);

  useEffect(() => {
    loadSummary();
    loadSuggestions();
  }, [loadSummary, loadSuggestions]);

  // While the AI maps an import, refresh the overview and the list.
  const mapping = summary?.imports.find((i) => i.status === "PROCESSING");
  useEffect(() => {
    if (!mapping) return;
    const t = setTimeout(() => {
      loadSummary();
      loadItems();
      loadSuggestions();
    }, 3000);
    return () => clearTimeout(t);
  }, [mapping, summary, loadSummary, loadItems, loadSuggestions]);

  async function retryImport(id: string) {
    const r = await fetch(`/api/interview-questions/import/${id}/retry`, { method: "POST" });
    if (!r.ok) setMessage({ tone: "error", text: apiErrorMessage(await r.json().catch(() => null), "Couldn't restart mapping") });
    loadSummary();
  }
  useEffect(() => {
    const t = setTimeout(loadItems, filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadItems, filters.q]);

  const topicTitle = useMemo(() => new Map((summary?.topics ?? []).map((t) => [t.id, `${t.sectionTitle} › ${t.title}`])), [summary]);
  const sections = useMemo(() => {
    const m = new Map<string, Array<{ id: string; title: string }>>();
    for (const t of summary?.topics ?? []) {
      const list = m.get(t.sectionTitle) ?? [];
      list.push({ id: t.id, title: t.title });
      m.set(t.sectionTitle, list);
    }
    return [...m.entries()];
  }, [summary]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage(null);
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setMessage({
        tone: "error",
        text: `“${file.name}” isn't an interview-questions/v1 JSON file. This import takes questions that are already classified (kind, topic, level). A raw list of questions — a .txt or a transcript export — has to be classified first.`,
      });
      return;
    }
    setImporting(true);
    try {
      const r = await fetch("/api/interview-questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: divisionId, payload }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        const issues = d?.error?.details;
        setMessage({ tone: "error", text: apiErrorMessage(d, "Import failed"), issues: Array.isArray(issues) ? issues : undefined });
        return;
      }
      const s = d.stats;
      setMessage({
        tone: "ok",
        text: `Imported ${s.received} questions: ${s.created} new, ${s.merged} merged into existing.${
          s.toMap ? ` The AI is now matching ${s.toMap} of them to the matrix — progress is shown below.` : ""
        }`,
      });
      setPage(1);
      await Promise.all([loadSummary(), loadItems()]);
    } finally {
      setImporting(false);
    }
  }

  async function patch(id: string, body: Partial<Question>) {
    const r = await fetch(`/api/interview-questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setMessage({ tone: "error", text: apiErrorMessage(await r.json().catch(() => null), "Couldn't save") });
      return;
    }
    const updated = (await r.json()) as Question;
    setItems((prev) => {
      if (!prev) return prev;
      // A hide/unhide moves the row out of the current view.
      if (body.hidden !== undefined) return prev.filter((x) => x.id !== id);
      return prev.map((x) => (x.id === id ? updated : x));
    });
    if (body.hidden !== undefined || body.topicId !== undefined || body.kind !== undefined) loadSummary();
  }

  const visibleTotal = (summary?.totals ?? []).filter((t) => !t.hidden).reduce((a, t) => a + t.count, 0);
  const byKind = (k: Kind) => (summary?.totals ?? []).filter((t) => !t.hidden && t.kind === k).reduce((a, t) => a + t.count, 0);
  const attached = (summary?.topics ?? []).reduce((a, t) => a + t.total, 0);
  const hot = [...(summary?.topics ?? [])].sort((a, b) => b.total - a.total);
  const cold = hot.filter((t) => t.total === 0);
  const pages = Math.max(1, Math.ceil(total / 50));
  const setFilter = (patchF: Partial<typeof filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patchF }));
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Interview questions</h1>
          <p className="page-subtitle mt-1">
            Questions asked at real client interviews, attached to tech matrix topics. Employees see them on the roadmap; the AI uses
            them when drafting PDPs and interview prep.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && divisions.length > 1 && (
            <select className="h-9 rounded-lg border bg-background px-2 text-sm" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button disabled={importing || !divisionId} onClick={() => fileRef.current?.click()}>
            {importing ? "Importing…" : "Import JSON"}
          </Button>
          <input ref={fileRef} type="file" accept=".json,.txt,application/json,text/plain" className="hidden" onChange={onFile} />
        </div>
      </div>

      {message && (
        <div
          className={
            message.tone === "ok"
              ? "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm"
              : "rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          }
        >
          {message.text}
          {message.issues && (
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {message.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {summary?.imports
        .filter((i) => i.status !== "DONE")
        .map((i) => (
          <div
            key={i.id}
            className={
              i.status === "FAILED"
                ? "flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
                : "flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm"
            }
          >
            <span className="font-medium">{i.title}</span>
            {i.status === "PROCESSING" ? (
              <>
                <span className="text-muted-foreground">
                  Matching questions to the matrix with AI… {i.mapDone} / {i.mapTotal}
                </span>
                <span className="h-1.5 min-w-32 flex-1 rounded-full bg-muted">
                  <span
                    className="block h-1.5 rounded-full bg-primary transition-all"
                    style={{ width: `${i.mapTotal ? Math.round((i.mapDone / i.mapTotal) * 100) : 0}%` }}
                  />
                </span>
              </>
            ) : (
              <>
                <span className="text-destructive">
                  Matching stopped at {i.mapDone} / {i.mapTotal}: {i.error}
                </span>
                <Button size="sm" variant="outline" onClick={() => retryImport(i.id)}>
                  Retry
                </Button>
              </>
            )}
          </div>
        ))}

      {divisionId && <QuestionImportFormat divisionId={divisionId} divisionName={divisions.find((d) => d.id === divisionId)?.name ?? null} />}

      {summary && visibleTotal === 0 && (
        <Card>
          <CardContent className="space-y-1 py-6 text-sm">
            <p className="font-medium">The bank is empty.</p>
            <p className="text-muted-foreground">
              Import a JSON file in the <code>interview-questions/v1</code> format — open “Import format and template” above for an
              example with this division&apos;s topic ids.
            </p>
          </CardContent>
        </Card>
      )}

      {summary && visibleTotal > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Questions" value={visibleTotal} note={`${attached} attached to matrix topics`} />
            <Kpi label="Theory" value={byKind("THEORY")} note="knowledge you can study for" />
            <Kpi label="Experience" value={byKind("EXPERIENCE")} note="“how did you use X?” — needs a project story" />
            <Kpi label="Behavioral & background" value={byKind("BEHAVIORAL") + byKind("BACKGROUND")} note="for interview readiness" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Matrix topics by how often clients ask</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {hot.filter((t) => t.total > 0).slice(0, 15).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setFilter({ topicId: t.id })}
                    className="grid w-full grid-cols-[minmax(0,1fr)_120px_100px] items-center gap-3 rounded px-1 py-0.5 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="truncate">
                      <span className="text-muted-foreground">{t.sectionTitle} › </span>
                      {t.title}
                    </span>
                    <span className="h-1.5 rounded-full bg-muted">
                      <span className="block h-1.5 rounded-full bg-primary" style={{ width: `${Math.round((t.total / Math.max(1, hot[0].total)) * 100)}%` }} />
                    </span>
                    <span className="whitespace-nowrap text-right font-mono text-xs text-muted-foreground">
                      {t.total} · {t.experience} exp
                    </span>
                  </button>
                ))}
                {cold.length > 0 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    <b className="text-foreground">Never asked ({cold.length}):</b> {cold.map((t) => t.title).join(", ")}
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Asked, but not in the matrix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {summary.proposed.length === 0 && <p className="text-sm text-muted-foreground">Everything is attached to a topic.</p>}
                {summary.proposed.slice(0, 20).map((p) => (
                  <div key={p.title} className="flex items-center justify-between text-sm">
                    <span className="truncate">{p.title}</span>
                    <span className="font-mono text-xs text-muted-foreground">{p.count}</span>
                  </div>
                ))}
                {summary.proposed.length > 0 && (
                  <button type="button" className="pt-2 text-xs text-primary hover:underline" onClick={() => setFilter({ topicId: "none" })}>
                    Show unattached questions
                  </button>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {suggestions && suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skills clients ask about that the matrix doesn&apos;t list</CardTitle>
            <p className="text-sm text-muted-foreground">
              Grouped from questions attached to each topic. Adding a skill puts it in the topic at the level you pick, and those questions
              then count towards its “asked N×” mark.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {suggestions.map((t) => (
              <div key={t.topicId} className="space-y-1.5">
                <div className="text-sm font-medium">
                  <span className="text-muted-foreground">{t.sectionTitle} › </span>
                  {t.title}
                </div>
                {t.skills.map((s) => (
                  <SuggestionRow
                    key={s.skill}
                    suggestion={s}
                    onAccept={(skill, band) => decideSkill({ action: "accept", topicId: t.topicId, proposed: s.skill, skill, band })}
                    onDismiss={() => decideSkill({ action: "dismiss", topicId: t.topicId, proposed: s.skill })}
                  />
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Questions{total ? ` · ${total}` : ""}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input className="h-8 w-64" placeholder="Search…" value={filters.q} onChange={(e) => setFilter({ q: e.target.value })} />
            <select className="h-8 rounded-lg border bg-background px-2" value={filters.topicId} onChange={(e) => setFilter({ topicId: e.target.value })}>
              <option value="">All topics</option>
              <option value="none">Not attached</option>
              {sections.map(([section, topics]) => (
                <optgroup key={section} label={section}>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <select className="h-8 rounded-lg border bg-background px-2" value={filters.kind} onChange={(e) => setFilter({ kind: e.target.value })}>
              <option value="">All kinds</option>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <select className="h-8 rounded-lg border bg-background px-2" value={filters.band} onChange={(e) => setFilter({ band: e.target.value })}>
              <option value="">Any level</option>
              <option value="jun">Junior</option>
              <option value="mid">Middle</option>
              <option value="sen">Senior</option>
              <option value="none">No level</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={filters.hidden} onChange={(e) => setFilter({ hidden: e.target.checked })} />
              Hidden only
            </label>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="divide-y">
            {items?.map((q) => (
              <div key={q.id} className="grid gap-2 px-6 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-sm">{q.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline">{KIND_LABEL[q.kind]}</Badge>
                    {q.band && <Badge variant="secondary">{BAND_LABEL[q.band]}</Badge>}
                    {q.timesAsked > 1 && <Badge variant="info">asked {q.timesAsked}×</Badge>}
                    <span className="truncate">
                      {q.topicId ? topicTitle.get(q.topicId) ?? "Topic removed from the matrix" : q.proposedTopic ? `Not in the matrix: ${q.proposedTopic}` : "No topic"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    className="h-8 max-w-56 rounded-lg border bg-background px-2 text-xs"
                    value={q.topicId ?? ""}
                    onChange={(e) => patch(q.id, { topicId: e.target.value || null })}
                    aria-label="Topic"
                  >
                    <option value="">— no topic</option>
                    {sections.map(([section, topics]) => (
                      <optgroup key={section} label={section}>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    className="h-8 rounded-lg border bg-background px-2 text-xs"
                    value={q.band ?? ""}
                    onChange={(e) => patch(q.id, { band: e.target.value || null })}
                    aria-label="Level"
                  >
                    <option value="">— level</option>
                    <option value="jun">Junior</option>
                    <option value="mid">Middle</option>
                    <option value="sen">Senior</option>
                  </select>
                  <select
                    className="h-8 rounded-lg border bg-background px-2 text-xs"
                    value={q.kind}
                    onChange={(e) => patch(q.id, { kind: e.target.value as Kind })}
                    aria-label="Kind"
                  >
                    {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => patch(q.id, { hidden: !q.hidden })}>
                    {q.hidden ? "Unhide" : "Hide"}
                  </Button>
                </div>
              </div>
            ))}
            {items && items.length === 0 && <p className="px-6 py-4 text-sm text-muted-foreground">No questions match.</p>}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 px-6 pt-3 text-sm">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-muted-foreground">
                {page} / {pages}
              </span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && summary.imports.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Last import: {summary.imports[0].title} · {new Date(summary.imports[0].createdAt).toLocaleDateString()}
          {summary.imports[0].createdBy ? ` · ${summary.imports[0].createdBy.name}` : ""} · {summary.imports[0].stats.created ?? 0} new,{" "}
          {summary.imports[0].stats.merged ?? 0} merged
        </p>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: { skill: string; questions: number; asked: number };
  onAccept: (skill: string, band: string) => void;
  onDismiss: () => void;
}) {
  const [skill, setSkill] = useState(suggestion.skill);
  const [band, setBand] = useState("mid");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
      <Input className="h-8 min-w-48 flex-1" value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill" />
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        asked {suggestion.asked}× · {suggestion.questions} question{suggestion.questions === 1 ? "" : "s"}
      </span>
      <select className="h-8 rounded-lg border bg-background px-2 text-xs" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Level">
        <option value="jun">Junior</option>
        <option value="mid">Middle</option>
        <option value="sen">Senior</option>
      </select>
      <Button size="sm" disabled={!skill.trim()} onClick={() => onAccept(skill.trim(), band)}>
        Add to matrix
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </CardContent>
    </Card>
  );
}
