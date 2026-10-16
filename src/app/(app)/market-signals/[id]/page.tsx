"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirm } from "@/components/confirm-dialog";
import { apiErrorMessage } from "@/lib/api-error";
import { pct, ppLabel } from "@/lib/market-report";
import {
  MAPPING_LABEL,
  MappingBadge,
  SourceStatusBadge,
  periodLabel,
  reportMetaLine,
  type MappingState,
  type SourceStatus,
} from "@/components/market-signals-ui";

interface SignalRow {
  id: string;
  label: string;
  kind: string;
  share: number | null;
  baseline: number | null;
  deltaPp: number | null;
  sampleN: number | null;
  lowConfidence: boolean;
  evidence: Array<{ requestId?: string; quote?: string }>;
  mappingState: MappingState;
  topic: { id: string; title: string; sectionTitle: string } | null;
  topicMissing: boolean;
  match: string | null;
  mappedBy: string | null;
  rationale: string | null;
  proposedTitle: string | null;
}

interface SourceDetail {
  id: string;
  title: string;
  format: string;
  status: SourceStatus;
  error: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  publishedAt: string | null;
  meta: {
    requests?: number;
    seniorShare?: number | null;
    juniorOnlyRequests?: number | null;
    baseline?: string | null;
    notes?: string[];
    portraits?: Array<{ name: string; signals: string[] }>;
  };
  division: { id: string; name: string };
  createdBy: { id: string; name: string } | null;
  signals: SignalRow[];
  topics: Array<{ id: string; title: string; sectionTitle: string }>;
}

type Filter = "ALL" | MappingState;

const MAPPED_BY: Record<string, string> = { rule: "label match", ai: "AI", admin: "set by admin" };

export default function SignalSourcePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/signal-sources/${id}`);
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      setLoadError(apiErrorMessage(data, "Couldn't load the source"));
      return;
    }
    setSource(data);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (source?.status !== "PROCESSING") return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [source, load]);

  const counts = useMemo(() => {
    const c: Record<MappingState, number> = { MAPPED: 0, PROPOSAL: 0, OUT_OF_SCOPE: 0, UNMAPPED: 0 };
    for (const s of source?.signals ?? []) c[s.mappingState]++;
    return c;
  }, [source]);

  const topicsBySection = useMemo(() => {
    const m = new Map<string, Array<{ id: string; title: string }>>();
    for (const t of source?.topics ?? []) {
      const list = m.get(t.sectionTitle) ?? [];
      list.push(t);
      m.set(t.sectionTitle, list);
    }
    return [...m.entries()];
  }, [source]);

  async function act(path: string, init: RequestInit, fallback: string) {
    setActionError(null);
    setBusy(true);
    try {
      const r = await fetch(path, init);
      if (!r.ok) {
        setActionError(apiErrorMessage(await r.json().catch(() => null), fallback));
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function reprocess(step: "extract" | "map") {
    if (step === "extract") {
      const ok = await confirm({
        title: "Re-run extraction?",
        description: "The AI reads the stored report again. Current signals, including mappings you set by hand, are replaced.",
        confirmLabel: "Re-run extraction",
      });
      if (!ok) return;
    }
    const json = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step }) };
    if (await act(`/api/signal-sources/${id}/reprocess`, json, "Couldn't restart processing")) load();
  }

  async function publish() {
    const pending = counts.UNMAPPED;
    const ok = await confirm({
      title: "Publish this report?",
      description: `PDPs in ${source?.division.name} can then be based on it, using the ${counts.MAPPED} mapped signals${
        pending ? ` (${pending} still unmapped are ignored)` : ""
      }. The division's previously published report is archived.`,
      confirmLabel: "Publish",
    });
    if (!ok) return;
    if (await act(`/api/signal-sources/${id}/publish`, { method: "POST" }, "Couldn't publish")) load();
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete “${source?.title}”?`,
      description: "Its signals are deleted. Plans already built on it keep their stored reasons.",
      confirmLabel: "Delete source",
      destructive: true,
    });
    if (!ok) return;
    if (await act(`/api/signal-sources/${id}`, { method: "DELETE" }, "Couldn't delete")) router.push("/market-signals");
  }

  async function saveMapping(signalId: string, body: Record<string, unknown>) {
    const ok = await act(
      `/api/signals/${signalId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      "Couldn't save the mapping"
    );
    if (ok) load();
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!source) return <p className="text-muted-foreground">Loading…</p>;

  const requests = source.meta.requests ?? null;
  const editable = source.status === "IN_REVIEW" || source.status === "ARCHIVED" || source.status === "FAILED";
  const rows = source.signals.filter((s) => filter === "ALL" || s.mappingState === filter);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-muted-foreground">
          <Link href="/market-signals" className="text-primary hover:underline">
            Market signals
          </Link>{" "}
          / {source.title}
        </div>
        <div className="page-header mt-2">
          <div>
            <h1 className="page-title flex items-center gap-3">
              {source.title} <SourceStatusBadge status={source.status} />
            </h1>
            <p className="page-subtitle mt-1">
              Market report · {source.division.name} · {periodLabel(source.periodFrom, source.periodTo)} ·{" "}
              {reportMetaLine({}, source.format)}
              {source.createdBy ? ` · added by ${source.createdBy.name}` : ""}
              {source.status === "IN_REVIEW" ? " · mapping waits for your confirmation" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {source.format !== "json" && source.status !== "PUBLISHED" && (
              <Button variant="outline" disabled={busy || source.status === "PROCESSING"} onClick={() => reprocess("extract")}>
                Re-run extraction
              </Button>
            )}
            {source.status !== "PUBLISHED" && (
              <Button variant="outline" disabled={busy || source.status === "PROCESSING"} onClick={() => reprocess("map")}>
                Re-run mapping
              </Button>
            )}
            {(source.status === "IN_REVIEW" || source.status === "ARCHIVED") && (
              <Button disabled={busy || counts.MAPPED === 0} onClick={publish}>
                {source.status === "ARCHIVED" ? "Publish again" : "Publish"}
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" disabled={busy} onClick={remove}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {source.status === "PROCESSING" && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {source.format === "json" ? "Mapping signals onto the tech matrix…" : "Reading the report and mapping signals onto the tech matrix…"}
          </CardContent>
        </Card>
      )}
      {source.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{source.error}</div>
      )}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {requests != null && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Requests" value={String(requests)} note={source.meta.baseline ? `baseline: ${source.meta.baseline}` : "no baseline"} />
          <Kpi
            label="Senior or above"
            value={source.meta.seniorShare != null ? pct(source.meta.seniorShare) : "—"}
            note={source.meta.juniorOnlyRequests === 0 ? "no junior-only requests" : source.meta.juniorOnlyRequests ? `${source.meta.juniorOnlyRequests} junior-only requests` : ""}
          />
          <Kpi label="One request =" value={`${(100 / requests).toFixed(1)} pp`} note="signals under 5 requests are flagged" accent />
          <Kpi label="Signals" value={String(source.signals.length)} note={`${counts.MAPPED} mapped · ${counts.PROPOSAL} proposals`} />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Extracted signals</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "MAPPED", "PROPOSAL", "OUT_OF_SCOPE", "UNMAPPED"] as Filter[])
              .filter((f) => f === "ALL" || counts[f as MappingState] > 0)
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={[
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    filter === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  ].join(" ")}
                >
                  {f === "ALL" ? `All · ${source.signals.length}` : `${MAPPING_LABEL[f as MappingState]} · ${counts[f as MappingState]}`}
                </button>
              ))}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Signal</TableHead>
                <TableHead className="text-right">Req.</TableHead>
                <TableHead className="text-right">Period</TableHead>
                <TableHead className="text-right">12 mo</TableHead>
                <TableHead className="text-right">Δ pp</TableHead>
                <TableHead>Mapped to tech matrix</TableHead>
                <TableHead className="pr-6">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} className="align-top">
                  <TableCell className="pl-6">
                    <div className="font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.kind}
                      {s.lowConfidence && <span className="text-warning-foreground dark:text-warning"> · low confidence, under 5 requests</span>}
                    </div>
                    {s.evidence.length > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground" title={s.evidence.map((e) => e.quote).filter(Boolean).join("\n")}>
                        {s.evidence.map((e) => e.requestId ?? "quote").join(", ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{s.sampleN ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{pct(s.share)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{pct(s.baseline)}</TableCell>
                  <TableCell
                    className={[
                      "text-right font-mono text-xs",
                      s.deltaPp == null ? "" : s.deltaPp > 0 ? "text-success" : s.deltaPp < 0 ? "text-destructive" : "",
                    ].join(" ")}
                  >
                    {s.deltaPp == null ? "—" : ppLabel(s.deltaPp).replace(" pp", "")}
                  </TableCell>
                  <TableCell className="min-w-72">
                    <MappingCell signal={s} sections={topicsBySection} editable={editable && !busy} onSave={(b) => saveMapping(s.id, b)} />
                  </TableCell>
                  <TableCell className="pr-6">
                    <MappingBadge state={s.mappingState} />
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="pl-6 text-muted-foreground">
                    {source.status === "PROCESSING" ? "Extracting…" : "No signals here."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {((source.meta.notes?.length ?? 0) > 0 || (source.meta.portraits?.length ?? 0) > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {(source.meta.notes?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extraction notes</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {source.meta.notes!.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {(source.meta.portraits?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Developer portraits found</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {source.meta.portraits!.map((p) => (
                  <p key={p.name}>
                    <span className="font-medium">{p.name}.</span> <span className="text-muted-foreground">{p.signals.join(", ")}</span>
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {note && <div className={accent ? "text-xs text-primary" : "text-xs text-muted-foreground"}>{note}</div>}
      </CardContent>
    </Card>
  );
}

const PROPOSAL = "__proposal__";
const OUT = "__out__";

function MappingCell(props: {
  signal: SignalRow;
  sections: Array<[string, Array<{ id: string; title: string }>]>;
  editable: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const s = props.signal;
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState("");
  const [proposed, setProposed] = useState("");

  function start() {
    setChoice(s.mappingState === "MAPPED" && s.topic ? s.topic.id : s.mappingState === "PROPOSAL" ? PROPOSAL : s.mappingState === "OUT_OF_SCOPE" ? OUT : "");
    setProposed(s.proposedTitle ?? s.label);
    setEditing(true);
  }

  function save() {
    if (choice === PROPOSAL) props.onSave({ state: "PROPOSAL", proposedTitle: proposed.trim() || s.label });
    else if (choice === OUT) props.onSave({ state: "OUT_OF_SCOPE" });
    else if (choice) props.onSave({ state: "MAPPED", topicId: choice, match: "exact" });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-1.5">
        <select className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={choice} onChange={(e) => setChoice(e.target.value)} autoFocus>
          <option value="" disabled>
            Choose a topic…
          </option>
          {props.sections.map(([section, topics]) => (
            <optgroup key={section} label={section}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={PROPOSAL}>No fit — propose a new topic</option>
          <option value={OUT}>Out of scope for this division</option>
        </select>
        {choice === PROPOSAL && (
          <input
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            value={proposed}
            onChange={(e) => setProposed(e.target.value)}
            placeholder="New topic title"
          />
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={!choice} onClick={save}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  let main: string;
  let note: string | null = null;
  if (s.mappingState === "MAPPED" && s.topic) {
    main = `${s.topic.sectionTitle} › ${s.topic.title}`;
    note = `${s.match === "partial" ? "partial match" : "exact match"}${s.mappedBy ? ` · ${MAPPED_BY[s.mappedBy] ?? s.mappedBy}` : ""}`;
  } else if (s.mappingState === "PROPOSAL") {
    main = `New topic · ${s.proposedTitle ?? s.label}`;
    note = "no match in the matrix — Tech Matrix → Market sync can draft it";
  } else if (s.mappingState === "OUT_OF_SCOPE") {
    main = s.kind === "constraint" ? "Hiring condition" : "Not in this division's matrix";
  } else {
    main = s.topicMissing ? "Mapped topic was deleted from the matrix" : "Not mapped yet";
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-sm">{main}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
        {s.rationale && s.mappedBy !== "rule" && <div className="text-xs text-muted-foreground italic">{s.rationale}</div>}
      </div>
      {props.editable && (
        <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={start}>
          Change
        </button>
      )}
    </div>
  );
}
