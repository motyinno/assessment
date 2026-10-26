"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { pct } from "@/lib/market-report";

/**
 * Tech matrix → Market sync: proposals drafted from a market report (what to
 * add, what is obsolete, Hot / Cooling tags). Accept / edit / reject each;
 * accepted ones are published together as a new matrix version
 * (lib/matrix-sync.ts).
 */

type Band = "jun" | "mid" | "sen";
const BANDS: Band[] = ["jun", "mid", "sen"];
const BAND_LABEL: Record<Band, string> = { jun: "Junior", mid: "Middle", sen: "Senior" };

type Kind = "ADD_SECTION" | "ADD_TOPIC" | "ADD_QUESTIONS" | "REMOVE_TOPIC" | "REMOVE_QUESTIONS" | "TAG_HOT" | "TAG_COOLING";
type State = "PENDING" | "ACCEPTED" | "REJECTED" | "APPLIED" | "SKIPPED";

interface Proposal {
  id: string;
  kind: Kind;
  state: State;
  title: string | null;
  payload: Partial<Record<Band, string[]>> & { topics?: Array<{ title: string } & Record<Band, string[]>> };
  rationale: string;
  section: { id: string; title: string } | null;
  topic: ({ id: string; title: string; sectionTitle: string } & Record<Band, string[]>) | null;
  targetMissing: boolean;
  affectedPeople: number;
  signals: Array<{ id: string; label: string; share: number | null; deltaPp: number | null; lowConfidence: boolean }>;
  evidence: string[];
}

interface NotProposed {
  id: string;
  label: string;
  share: number | null;
  deltaPp: number | null;
  reason: string;
}

interface SyncSource {
  id: string;
  title: string;
  status: string;
  proposalsStatus: string | null;
  openProposals: number;
}

interface Version {
  id: string;
  number: number;
  summary: Array<{ kind: string; title: string }>;
  createdAt: string;
  source: { title: string } | null;
  createdBy: { name: string } | null;
}

interface Props {
  divisionId: string;
  divisionName: string | null;
  initialSourceId?: string | null;
  /** Called after a version is published, so the editor reloads the matrix. */
  onPublished: () => void;
  onOpenCount?: (n: number) => void;
}

// Additions first, then tags, then removals — the order a reviewer decides in.
const KIND_ORDER: Kind[] = ["ADD_SECTION", "ADD_TOPIC", "ADD_QUESTIONS", "TAG_HOT", "TAG_COOLING", "REMOVE_TOPIC", "REMOVE_QUESTIONS"];

export function MarketSyncPanel({ divisionId, divisionName, initialSourceId, onPublished, onOpenCount }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [sources, setSources] = useState<SyncSource[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [sourceId, setSourceId] = useState(initialSourceId ?? "");
  const [data, setData] = useState<{
    source: { proposalsStatus: string | null; proposalsError: string | null };
    proposals: Proposal[];
    notProposed: NotProposed[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    const r = await fetch(`/api/tech-matrix/market-sync?departmentId=${encodeURIComponent(divisionId)}`);
    if (!r.ok) return;
    const d = (await r.json()) as { sources: SyncSource[]; versions: Version[] };
    setSources(d.sources);
    setVersions(d.versions);
    onOpenCount?.(d.sources.reduce((a, s) => a + s.openProposals, 0));
    setSourceId((cur) => (cur && d.sources.some((s) => s.id === cur) ? cur : d.sources.find((s) => s.status === "PUBLISHED")?.id ?? d.sources[0]?.id ?? ""));
  }, [divisionId, onOpenCount]);

  const loadProposals = useCallback(async () => {
    if (!sourceId) return setData(null);
    const r = await fetch(`/api/signal-sources/${sourceId}/proposals`);
    if (r.ok) setData(await r.json());
  }, [sourceId]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);
  useEffect(() => {
    loadProposals();
  }, [loadProposals]);
  useEffect(() => {
    if (data?.source.proposalsStatus !== "GENERATING") return;
    const t = setTimeout(() => {
      loadProposals();
      loadSources();
    }, 3000);
    return () => clearTimeout(t);
  }, [data, loadProposals, loadSources]);

  const open = useMemo(() => (data?.proposals ?? []).filter((p) => p.state !== "APPLIED" && p.state !== "SKIPPED"), [data]);
  const accepted = open.filter((p) => p.state === "ACCEPTED").length;

  async function call(path: string, init: RequestInit, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await fetch(path, init);
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setError(apiErrorMessage(body, fallback));
        return null;
      }
      return body ?? {};
    } finally {
      setBusy(false);
    }
  }

  async function draft() {
    if (open.length) {
      const ok = await confirm({
        title: "Redraft proposals?",
        description: "Current unpublished proposals of this report, including the ones you accepted or edited, are replaced.",
        confirmLabel: "Redraft",
      });
      if (!ok) return;
    }
    if (await call(`/api/signal-sources/${sourceId}/proposals`, { method: "POST" }, "Couldn't start drafting")) {
      setNotice(null);
      loadProposals();
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await call(
      `/api/matrix-proposals/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "Couldn't update the proposal"
    );
    if (res) {
      await loadProposals();
      loadSources();
    }
    return !!res;
  }

  async function setState(p: Proposal, state: State) {
    if (state === "ACCEPTED" && p.kind === "REMOVE_TOPIC" && p.affectedPeople > 0) {
      const ok = await confirm({
        title: `Remove “${p.topic?.title}” on publish?`,
        description: `${p.affectedPeople} ${p.affectedPeople === 1 ? "person has" : "people have"} roadmap progress on this topic. It will be orphaned (kept, but no longer shown).`,
        confirmLabel: "Accept removal",
        destructive: true,
      });
      if (!ok) return;
    }
    await patch(p.id, { state });
  }

  async function publish() {
    const removals = open.filter((p) => p.state === "ACCEPTED" && p.kind.startsWith("REMOVE")).length;
    const ok = await confirm({
      title: `Publish ${accepted} change${accepted === 1 ? "" : "s"}?`,
      description: `This creates a new version of the ${divisionName ?? "division's"} matrix linked to this report.${
        removals ? ` ${removals} removal${removals === 1 ? "" : "s"} included — progress on removed items is orphaned.` : ""
      } Pending and rejected proposals stay as they are.`,
      confirmLabel: "Publish new version",
    });
    if (!ok) return;
    const res = (await call(`/api/signal-sources/${sourceId}/proposals/apply`, { method: "POST" }, "Couldn't publish")) as
      | { number: number; applied: number; skipped: number }
      | null;
    if (res) {
      setNotice(`Published version ${res.number}: ${res.applied} change${res.applied === 1 ? "" : "s"}${res.skipped ? `, ${res.skipped} skipped (target no longer exists)` : ""}.`);
      await Promise.all([loadProposals(), loadSources()]);
      onPublished();
    }
  }

  if (sources === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (sources.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm">
          No reviewed market report for {divisionName ?? "this division"} yet.{" "}
          <Link href="/market-signals" className="text-primary hover:underline">
            Add one in Market signals
          </Link>{" "}
          — proposals are drafted from its mapped signals.
        </CardContent>
      </Card>
    );
  }

  const generating = data?.source.proposalsStatus === "GENERATING";
  const sorted = [...open].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const ready = data?.source.proposalsStatus === "READY" && !generating;
  const hasRemovals = open.some((p) => p.kind === "REMOVE_TOPIC" || p.kind === "REMOVE_QUESTIONS");

  return (
    <div className="space-y-4">
      <div className="-mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          Market sync — editing <b className="text-foreground">{divisionName}</b> against
        </span>
        <select
          className="-ml-1 cursor-pointer rounded bg-transparent px-1 font-medium text-primary hover:bg-primary/10 focus:outline-none"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          aria-label="Market report"
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.status === "IN_REVIEW" ? " (in review)" : s.status === "ARCHIVED" ? " (archived)" : ""}
            </option>
          ))}
        </select>
        {data?.source.proposalsStatus && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            disabled={busy || generating}
            onClick={draft}
          >
            {generating ? "Drafting…" : "Redraft"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <p className="min-w-0 flex-1">
          Proposals are a draft. Accepted ones are published together as a new matrix version; existing progress is kept. A falling
          signal only gets a <b>Cooling</b> tag; removals are proposed only for clearly obsolete content.
        </p>
        <span className="rounded-full border bg-background px-2.5 py-0.5 text-xs">
          Accepted {accepted} / {open.length}
        </span>
        <span className="rounded-full border bg-background px-2.5 py-0.5 text-xs">Weight = 0.6 × month + 0.4 × 12 mo</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm">{notice}</div>}
      {data?.source.proposalsStatus === "FAILED" && data.source.proposalsError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{data.source.proposalsError}</div>
      )}

      {generating ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            The AI is reading the report against the matrix… this takes up to a minute.
          </CardContent>
        </Card>
      ) : data && !data.source.proposalsStatus ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No proposals for this report yet.</p>
            <Button className="bg-success text-success-foreground hover:bg-success/90" disabled={busy} onClick={draft}>
              Draft proposals
            </Button>
          </CardContent>
        </Card>
      ) : ready && open.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing open — every proposal of this report is published, or none were found.
          </CardContent>
        </Card>
      ) : null}

      {!generating &&
        sorted.map((p) => <ProposalCard key={p.id} p={p} busy={busy} onState={(st) => setState(p, st)} onSave={(b) => patch(p.id, b)} />)}

      {ready && (data?.notProposed.length || !hasRemovals) ? (
        <Card>
          <CardContent className="space-y-2 py-5">
            <div className="text-base font-semibold">Not proposed</div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data?.notProposed.map((n) => (
                <li key={n.id}>
                  <b className="text-foreground">{n.label}</b>
                  {n.share != null ? ` · ${pct(n.share)}` : ""}
                  {n.deltaPp != null ? `, ${n.deltaPp > 0 ? "+" : ""}${n.deltaPp.toFixed(1)} pp` : ""} — {n.reason}
                </li>
              ))}
              {!hasRemovals && (
                <li>
                  <b className="text-foreground">Removals</b> — nothing in the matrix looks obsolete against this report. Silence in one
                  month&apos;s requests isn&apos;t evidence; remove by hand in Edit if needed.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {open.length > 0 && !generating && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <span className="text-sm text-muted-foreground">
            Publishing creates a new version of the {divisionName} matrix and links it to this report.
          </span>
          <Button className="bg-success text-success-foreground hover:bg-success/90" disabled={busy || accepted === 0} onClick={publish}>
            Publish new version{accepted ? ` · ${accepted}` : ""}
          </Button>
        </div>
      )}

      {versions.length > 0 && (
        <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Matrix versions</div>
          {versions.map((v) => (
            <div key={v.id}>
              <span className="font-mono text-foreground">v{v.number}</span> · {new Date(v.createdAt).toLocaleDateString()}
              {v.source ? ` · from ${v.source.title}` : ""}
              {v.createdBy ? ` · ${v.createdBy.name}` : ""} · {v.summary.length} change{v.summary.length === 1 ? "" : "s"}:{" "}
              {v.summary.slice(0, 4).map((x) => x.title).join(", ")}
              {v.summary.length > 4 ? "…" : ""}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function kindPill(p: Proposal): { label: string; context: string; tone: "info" | "warning" | "muted" | "destructive" } {
  switch (p.kind) {
    case "ADD_SECTION":
      return { label: "New section", context: p.section ? `after ${p.section.title}` : "at the end", tone: "info" };
    case "ADD_TOPIC":
      return { label: "New topic", context: p.section?.title ?? "", tone: "info" };
    case "ADD_QUESTIONS":
      return { label: "Add questions", context: p.topic ? `${p.topic.sectionTitle} › ${p.topic.title}` : "", tone: "info" };
    case "TAG_HOT":
      return { label: "Priority tag · Hot", context: p.topic?.sectionTitle ?? "", tone: "warning" };
    case "TAG_COOLING":
      return { label: "Trend tag · Cooling", context: p.topic?.sectionTitle ?? "", tone: "muted" };
    case "REMOVE_TOPIC":
      return { label: "Remove topic", context: p.topic?.sectionTitle ?? "", tone: "destructive" };
    case "REMOVE_QUESTIONS":
      return { label: "Remove questions", context: p.topic ? `${p.topic.sectionTitle} › ${p.topic.title}` : "", tone: "destructive" };
  }
}

const PILL_TONE = {
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/50 bg-warning/20 text-warning-foreground dark:text-warning",
  muted: "border-border bg-muted text-muted-foreground",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

function headline(p: Proposal): string {
  if (p.kind === "ADD_SECTION" || p.kind === "ADD_TOPIC") return p.title ?? "Untitled";
  return p.topic?.title ?? "Topic no longer in the matrix";
}

function ProposalCard({
  p,
  busy,
  onState,
  onSave,
}: {
  p: Proposal;
  busy: boolean;
  onState: (s: State) => void;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const editable = p.kind === "ADD_SECTION" || p.kind === "ADD_TOPIC" || p.kind === "ADD_QUESTIONS";
  const removal = p.kind === "REMOVE_TOPIC" || p.kind === "REMOVE_QUESTIONS";
  const pill = kindPill(p);

  return (
    <Card className={p.state === "ACCEPTED" ? "ring-2 ring-success/50" : p.state === "REJECTED" ? "opacity-55" : ""}>
      <CardContent className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2 py-0.5 font-medium ${PILL_TONE[pill.tone]}`}>{pill.label}</span>
              {pill.context && <span className="text-muted-foreground">{pill.context}</span>}
            </div>
            <h3 className="mt-1.5 text-lg font-semibold leading-tight">{headline(p)}</h3>
          </div>
          <div className="flex items-center gap-2">
            {p.state === "PENDING" ? (
              <>
                <Button variant="outline" disabled={busy} onClick={() => onState("REJECTED")}>
                  Reject
                </Button>
                {editable && (
                  <Button variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)}>
                    Edit
                  </Button>
                )}
                <Button
                  className={removal ? "" : "bg-success text-success-foreground hover:bg-success/90"}
                  variant={removal ? "destructive" : "default"}
                  disabled={busy || p.targetMissing}
                  onClick={() => onState("ACCEPTED")}
                >
                  Accept
                </Button>
              </>
            ) : (
              <>
                <Badge variant={p.state === "ACCEPTED" ? "success" : "secondary"}>{p.state === "ACCEPTED" ? "Accepted" : "Rejected"}</Badge>
                <Button variant="ghost" disabled={busy} onClick={() => onState("PENDING")}>
                  Undo
                </Button>
              </>
            )}
          </div>
        </div>

        <p className="text-sm">
          <b>Why:</b> {p.rationale}
        </p>
        {p.targetMissing && <p className="text-xs text-destructive">The target was removed from the matrix since this was drafted.</p>}
        {p.kind === "REMOVE_TOPIC" && (
          <p className="text-xs text-destructive">
            {p.affectedPeople
              ? `${p.affectedPeople} ${p.affectedPeople === 1 ? "person has" : "people have"} roadmap progress here — it will be orphaned.`
              : "Nobody has roadmap progress on this topic."}
          </p>
        )}

        {editing ? (
          <ProposalEditor p={p} onCancel={() => setEditing(false)} onSave={async (b) => (await onSave(b)) && setEditing(false)} />
        ) : (
          <ProposalBody p={p} />
        )}

        {(p.signals.length > 0 || p.evidence.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {p.signals.map((s) => (
              <span key={s.id} className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                {s.label} {pct(s.share)}
                {s.deltaPp != null ? ` · ${s.deltaPp > 0 ? "+" : "−"}${Math.abs(s.deltaPp).toFixed(1)}` : ""}
                {s.lowConfidence ? " · low conf." : ""}
              </span>
            ))}
            {p.evidence.map((id) => (
              <span key={id} className="rounded-full border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {id}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillChip({ text, sign }: { text: string; sign: "+" | "−" }) {
  return (
    <span
      className={
        sign === "+"
          ? "inline-flex rounded-full border border-dashed border-info/50 bg-info/5 px-2.5 py-0.5 text-xs text-info"
          : "inline-flex rounded-full border border-dashed border-destructive/50 bg-destructive/5 px-2.5 py-0.5 text-xs text-destructive line-through"
      }
    >
      {sign}
      {text}
    </span>
  );
}

function BandColumns({ skills, sign, existing }: { skills: Partial<Record<Band, string[]>>; sign: "+" | "−"; existing?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {BANDS.map((b) => {
        const list = skills[b] ?? [];
        return (
          <div key={b} className="min-h-24 rounded-xl border p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{BAND_LABEL[b]}</div>
            {list.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{existing ? "no change" : "not expected at this level"}</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {list.map((x) => (
                  <SkillChip key={x} text={x} sign={sign} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProposalBody({ p }: { p: Proposal }) {
  switch (p.kind) {
    case "ADD_SECTION":
      return (
        <div className="space-y-4">
          {(p.payload.topics ?? []).map((t) => (
            <div key={t.title} className="space-y-2">
              <div className="text-sm font-semibold">{t.title}</div>
              <BandColumns skills={t} sign="+" />
            </div>
          ))}
        </div>
      );
    case "ADD_TOPIC":
      return <BandColumns skills={p.payload} sign="+" />;
    case "ADD_QUESTIONS":
      return <BandColumns skills={p.payload} sign="+" existing />;
    case "REMOVE_QUESTIONS":
      return <BandColumns skills={p.payload} sign="−" existing />;
    case "REMOVE_TOPIC":
      return p.topic ? <BandColumns skills={p.topic} sign="−" existing /> : null;
    default:
      return null;
  }
}

const toLines = (l: string[] | undefined) => (l ?? []).join("\n");
const fromLines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function ProposalEditor({ p, onCancel, onSave }: { p: Proposal; onCancel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(p.title ?? "");
  const [bands, setBands] = useState<Record<Band, string>>({ jun: toLines(p.payload.jun), mid: toLines(p.payload.mid), sen: toLines(p.payload.sen) });
  const [topics, setTopics] = useState(
    (p.payload.topics ?? []).map((t) => ({ title: t.title, jun: toLines(t.jun), mid: toLines(t.mid), sen: toLines(t.sen) }))
  );

  function save() {
    if (p.kind === "ADD_SECTION") {
      onSave({
        title: title.trim() || undefined,
        payload: {
          topics: topics
            .filter((t) => t.title.trim())
            .map((t) => ({ title: t.title.trim(), jun: fromLines(t.jun), mid: fromLines(t.mid), sen: fromLines(t.sen) })),
        },
      });
    } else {
      onSave({
        ...(p.kind === "ADD_TOPIC" && title.trim() ? { title: title.trim() } : {}),
        payload: { jun: fromLines(bands.jun), mid: fromLines(bands.mid), sen: fromLines(bands.sen) },
      });
    }
  }

  const bandAreas = (value: Record<Band, string>, set: (b: Band, v: string) => void) => (
    <div className="grid gap-3 md:grid-cols-3">
      {BANDS.map((b) => (
        <label key={b} className="rounded-xl border bg-background p-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {BAND_LABEL[b]} <span className="font-normal normal-case tracking-normal">— one per line</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-lg border bg-background p-2 text-sm font-normal normal-case tracking-normal text-foreground"
            value={value[b]}
            onChange={(e) => set(b, e.target.value)}
          />
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-3">
      {(p.kind === "ADD_SECTION" || p.kind === "ADD_TOPIC") && (
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={p.kind === "ADD_SECTION" ? "Section title" : "Topic title"} />
      )}
      {p.kind === "ADD_SECTION"
        ? topics.map((t, i) => (
            <div key={i} className="space-y-2">
              <Input
                value={t.title}
                placeholder="Topic title (empty = drop this topic)"
                onChange={(e) => setTopics((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              />
              {bandAreas(t, (b, v) => setTopics((prev) => prev.map((x, j) => (j === i ? { ...x, [b]: v } : x))))}
            </div>
          ))
        : bandAreas(bands, (b, v) => setBands((prev) => ({ ...prev, [b]: v })))}
      <div className="flex gap-2">
        <Button className="bg-success text-success-foreground hover:bg-success/90" onClick={save}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
