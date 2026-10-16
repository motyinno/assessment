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

const GROUPS: Array<{ title: string; note: string; kinds: Kind[] }> = [
  { title: "Add to the matrix", note: "What clients ask for that the matrix doesn't check yet.", kinds: ["ADD_SECTION", "ADD_TOPIC", "ADD_QUESTIONS"] },
  { title: "Trend tags", note: "Shown as badges on the matrix and in the PDP picker. A tag never removes anything.", kinds: ["TAG_HOT", "TAG_COOLING"] },
  {
    title: "Consider removing",
    note: "Obsolete or clearly fading content. Removing orphans employees' progress on it — accept only if you're sure.",
    kinds: ["REMOVE_TOPIC", "REMOVE_QUESTIONS"],
  },
];

export function MarketSyncPanel({ divisionId, divisionName, initialSourceId, onPublished, onOpenCount }: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [sources, setSources] = useState<SyncSource[] | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [sourceId, setSourceId] = useState(initialSourceId ?? "");
  const [data, setData] = useState<{ source: { proposalsStatus: string | null; proposalsError: string | null }; proposals: Proposal[] } | null>(null);
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
  const current = sources.find((s) => s.id === sourceId);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
          <span className="text-muted-foreground">
            Market sync — editing <b className="text-foreground">{divisionName}</b> against
          </span>
          <select className="h-8 rounded-lg border bg-background px-2" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {s.status === "IN_REVIEW" ? "in review" : s.status.toLowerCase()}
              </option>
            ))}
          </select>
          <Button size="sm" variant={open.length ? "outline" : "default"} disabled={busy || generating} onClick={draft}>
            {generating ? "Drafting…" : open.length || data?.source.proposalsStatus ? "Redraft proposals" : "Draft proposals"}
          </Button>
          {current && (
            <Link href={`/market-signals/${current.id}`} className="text-xs text-primary hover:underline">
              Open report
            </Link>
          )}
          <span className="ml-auto text-xs text-muted-foreground">Weight = 0.6 × month + 0.4 × 12 mo</span>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        Proposals are a draft. Accepted ones are published together as a new matrix version; progress on everything that stays is
        kept. A falling signal only proposes a <b>Cooling</b> tag — removals are proposed only for clearly obsolete content.
        <span className="float-right font-medium">
          Accepted {accepted} / {open.length}
        </span>
      </div>

      {generating && <p className="text-sm text-muted-foreground">The AI is reading the report against the matrix… this takes up to a minute.</p>}
      {data?.source.proposalsStatus === "FAILED" && data.source.proposalsError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{data.source.proposalsError}</div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">{notice}</div>}
      {!generating && data && !data.source.proposalsStatus && (
        <p className="text-sm text-muted-foreground">No proposals for this report yet — press “Draft proposals”.</p>
      )}
      {!generating && data?.source.proposalsStatus === "READY" && open.length === 0 && (
        <p className="text-sm text-muted-foreground">Nothing open — every proposal of this report is published, or none were found.</p>
      )}

      {GROUPS.map((g) => {
        const items = open.filter((p) => g.kinds.includes(p.kind));
        const ready = data?.source.proposalsStatus === "READY" && !generating && open.length > 0;
        if (!items.length && !(ready && g.kinds.includes("REMOVE_TOPIC"))) return null;
        return (
          <section key={g.title} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.note}</p>
            </div>
            {items.length === 0 && (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Nothing looks obsolete against this report. Topics the report doesn&apos;t mention aren&apos;t proposed for removal —
                silence in one month&apos;s requests isn&apos;t evidence. Remove by hand in Edit if needed.
              </p>
            )}
            {items.map((p) => (
              <ProposalCard key={p.id} p={p} busy={busy} onState={(s) => setState(p, s)} onSave={(b) => patch(p.id, b)} />
            ))}
          </section>
        );
      })}

      {open.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
          <span className="text-xs text-muted-foreground">Publishing creates a new version of the {divisionName} matrix and links it to this report.</span>
          <Button disabled={busy || accepted === 0} onClick={publish}>
            Publish new version{accepted ? ` · ${accepted}` : ""}
          </Button>
        </div>
      )}

      {versions.length > 0 && (
        <Card>
          <CardContent className="space-y-1 py-4 text-sm">
            <div className="font-medium">Matrix versions</div>
            {versions.map((v) => (
              <div key={v.id} className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">v{v.number}</span> · {new Date(v.createdAt).toLocaleDateString()}
                {v.source ? ` · from ${v.source.title}` : ""}
                {v.createdBy ? ` · ${v.createdBy.name}` : ""} · {v.summary.length} change{v.summary.length === 1 ? "" : "s"}:{" "}
                {v.summary.slice(0, 4).map((s) => s.title).join(", ")}
                {v.summary.length > 4 ? "…" : ""}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {confirmDialog}
    </div>
  );
}

function kindLabel(p: Proposal): string {
  switch (p.kind) {
    case "ADD_SECTION":
      return p.section ? `New section · after ${p.section.title}` : "New section";
    case "ADD_TOPIC":
      return `New topic · ${p.section?.title ?? "?"}`;
    case "ADD_QUESTIONS":
      return `Add questions · ${p.topic ? `${p.topic.sectionTitle} › ${p.topic.title}` : "?"}`;
    case "REMOVE_TOPIC":
      return `Remove topic · ${p.topic?.sectionTitle ?? "?"}`;
    case "REMOVE_QUESTIONS":
      return `Remove questions · ${p.topic ? `${p.topic.sectionTitle} › ${p.topic.title}` : "?"}`;
    case "TAG_HOT":
      return "Priority tag · Hot";
    case "TAG_COOLING":
      return "Trend tag · Cooling";
  }
}

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

  const tone =
    p.state === "ACCEPTED" ? "border-success/50 bg-success/5" : p.state === "REJECTED" ? "opacity-60" : removal ? "border-destructive/30" : "";

  return (
    <Card className={tone}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{kindLabel(p)}</div>
            <div className="text-base font-semibold">{headline(p)}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {p.state === "PENDING" ? (
              <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onState("REJECTED")}>
                  Reject
                </Button>
                {editable && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)}>
                    Edit
                  </Button>
                )}
                <Button size="sm" variant={removal ? "destructive" : "default"} disabled={busy || p.targetMissing} onClick={() => onState("ACCEPTED")}>
                  Accept
                </Button>
              </>
            ) : (
              <>
                <Badge variant={p.state === "ACCEPTED" ? "success" : "secondary"}>{p.state === "ACCEPTED" ? "Accepted" : "Rejected"}</Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onState("PENDING")}>
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

        {p.signals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.signals.map((s) => (
              <Badge key={s.id} variant="info">
                {s.label} {pct(s.share)}
                {s.deltaPp != null ? ` · ${s.deltaPp > 0 ? "+" : ""}${s.deltaPp.toFixed(1)}` : ""}
                {s.lowConfidence ? " · low conf." : ""}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BandColumns({ skills, sign, existing }: { skills: Partial<Record<Band, string[]>>; sign: "+" | "−"; existing?: Partial<Record<Band, string[]>> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {BANDS.map((b) => {
        const list = skills[b] ?? [];
        return (
          <div key={b}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{BAND_LABEL[b]}</div>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground">{existing ? "no change" : "not expected at this level"}</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5 text-sm">
                {list.map((s) => (
                  <li key={s} className={sign === "+" ? "text-success" : "text-destructive line-through"}>
                    <span className="mr-1 font-mono">{sign}</span>
                    <span className={sign === "+" ? "text-foreground" : ""}>{s}</span>
                  </li>
                ))}
              </ul>
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
        <div className="space-y-3">
          {(p.payload.topics ?? []).map((t) => (
            <div key={t.title} className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-medium">{t.title}</div>
              <BandColumns skills={t} sign="+" />
            </div>
          ))}
        </div>
      );
    case "ADD_TOPIC":
      return <BandColumns skills={p.payload} sign="+" />;
    case "ADD_QUESTIONS":
      return <BandColumns skills={p.payload} sign="+" existing={p.topic ?? {}} />;
    case "REMOVE_QUESTIONS":
      return <BandColumns skills={p.payload} sign="−" existing={p.topic ?? {}} />;
    case "REMOVE_TOPIC":
      return p.topic ? (
        <p className="text-xs text-muted-foreground">
          Removes {BANDS.reduce((a, b) => a + p.topic![b].length, 0)} questions: {BANDS.flatMap((b) => p.topic![b]).slice(0, 8).join(", ")}
          {BANDS.reduce((a, b) => a + p.topic![b].length, 0) > 8 ? "…" : ""}
        </p>
      ) : null;
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
    <div className="grid gap-3 sm:grid-cols-3">
      {BANDS.map((b) => (
        <label key={b} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {BAND_LABEL[b]} — one per line
          <textarea
            className="mt-1 min-h-24 w-full rounded-lg border bg-background p-2 text-sm font-normal normal-case tracking-normal text-foreground"
            value={value[b]}
            onChange={(e) => set(b, e.target.value)}
          />
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      {(p.kind === "ADD_SECTION" || p.kind === "ADD_TOPIC") && (
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={p.kind === "ADD_SECTION" ? "Section title" : "Topic title"} />
      )}
      {p.kind === "ADD_SECTION"
        ? topics.map((t, i) => (
            <div key={i} className="space-y-2 rounded-lg border bg-background p-3">
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
        <Button size="sm" onClick={save}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
