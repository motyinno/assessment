"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-error";
import { SourceStatusBadge, periodLabel, reportMetaLine } from "@/components/market-signals-ui";

interface Division {
  id: string;
  name: string;
}

interface SourceRow {
  id: string;
  title: string;
  format: string;
  status: "PROCESSING" | "FAILED" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED";
  error: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  meta: Record<string, unknown>;
  counts: Partial<Record<"UNMAPPED" | "MAPPED" | "PROPOSAL" | "OUT_OF_SCOPE", number>> | null;
}

type Mode = null | "file" | "text" | "json";

const MAX_BYTES = 2_000_000;

function formatFromFileName(name: string): "json" | "html" | "text" {
  const n = name.toLowerCase();
  if (n.endsWith(".json")) return "json";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "html";
  return "text";
}

const PIPELINE = [
  ["Ingest", "File, text or JSON. Raw input is stored as-is for audit."],
  ["Extract", "AI turns it into signals: label, share, trend, sample size, evidence. JSON skips this step."],
  ["Map", "Each signal is matched to a topic of the division's tech matrix."],
  ["Review", "An admin confirms the mapping before anything is used."],
  ["Publish", "The source becomes usable as a PDP basis; the previous report is archived."],
] as const;

export default function MarketSignalsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isSuperAdmin = !!(session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;

  const [divisions, setDivisions] = useState<Division[]>([]);
  const [divisionId, setDivisionId] = useState("");
  const [sources, setSources] = useState<SourceRow[] | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; issues?: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetch("/api/tech-matrix/divisions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { divisions: Division[]; own: Division | null } | null) => {
        if (!data) return;
        setDivisions(data.divisions);
        setDivisionId(data.own?.id ?? data.divisions[0]?.id ?? "");
      });
  }, [status, role, router]);

  const load = useCallback(async () => {
    if (!divisionId) return;
    const r = await fetch(`/api/signal-sources?departmentId=${encodeURIComponent(divisionId)}`);
    if (r.ok) setSources(await r.json());
  }, [divisionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Processing runs in the background; poll until it settles.
  useEffect(() => {
    if (!sources?.some((s) => s.status === "PROCESSING")) return;
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [sources, load]);

  async function submit(format: "json" | "html" | "text", content: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/signal-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, content, title: title.trim() || null, departmentId: divisionId || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const issues = data?.error?.details;
        setError({ message: apiErrorMessage(data, "Couldn't add the source"), issues: Array.isArray(issues) ? issues : undefined });
        return;
      }
      router.push(`/market-signals/${data.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError({ message: "The file is larger than 2 MB" });
      return;
    }
    await submit(formatFromFileName(file.name), await file.text());
  }

  function openMode(m: Mode) {
    setError(null);
    setMode(m);
    if (m === "file") fileRef.current?.click();
  }

  const divisionName = divisions.find((d) => d.id === divisionId)?.name;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Market signals</h1>
          <p className="page-subtitle mt-1">
            Data that should shape development plans, starting with monthly client-request reports. Each source becomes
            weighted signals mapped onto {divisionName ? `the ${divisionName}` : "the"} tech matrix.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && divisions.length > 1 && (
            <select
              className="h-9 rounded-lg border bg-background px-2 text-sm"
              value={divisionId}
              onChange={(e) => {
                setSources(null);
                setDivisionId(e.target.value);
              }}
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => addRef.current?.scrollIntoView({ behavior: "smooth" })}>Add source</Button>
        </div>
      </div>

      <div ref={addRef}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a source</CardTitle>
          <p className="text-sm text-muted-foreground">
            A report in the market-report/v1 JSON imports as-is. Anything else is read by AI; you confirm the mapping
            before it is used.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SourceTile
              title="Upload file"
              body="HTML export of a report, JSON, plain text or Markdown"
              active={mode === "file"}
              dashed
              onClick={() => openMode("file")}
            />
            <SourceTile title="Paste text" body="Report summary, client request, notes" active={mode === "text"} onClick={() => openMode("text")} />
            <SourceTile
              title="Structured JSON"
              body="Market report contract v1 — imported without AI, fully deterministic"
              active={mode === "json"}
              onClick={() => openMode("json")}
            />
            <SourceTile title="Artifact link" body="Fetch a published report by URL once access is set up" later />
          </div>
          <input ref={fileRef} type="file" accept=".html,.htm,.json,.txt,.md,.csv" className="hidden" onChange={onFile} />

          {(mode === "text" || mode === "json") && (
            <div className="space-y-2">
              <Input placeholder="Title (optional — taken from the report period)" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea
                className="min-h-48 w-full rounded-lg border bg-background p-3 font-mono text-xs"
                placeholder={mode === "json" ? '{ "schema": "market-report/v1", "period": { … }, "requests": 45, "signals": [ … ] }' : "Paste the report text here"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button disabled={submitting || !text.trim() || !divisionId} onClick={() => submit(mode, text)}>
                  {submitting ? "Adding…" : mode === "json" ? "Import" : "Extract signals"}
                </Button>
                <Button variant="outline" onClick={() => setMode(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {mode === "file" && submitting && <p className="text-sm text-muted-foreground">Uploading…</p>}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{error.message}</p>
              {error.issues && (
                <ul className="mt-1 list-disc pl-5 font-mono text-xs">
                  {error.issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sources</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Signals</TableHead>
                <TableHead>New topic proposals</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources === null && (
                <TableRow>
                  <TableCell colSpan={7} className="pl-6 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {sources?.map((s) => {
                const total = Object.values(s.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
                const proposals = s.counts?.PROPOSAL ?? 0;
                const line = s.status === "FAILED" ? s.error : reportMetaLine(s.meta, s.format);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="pl-6">
                      <Link href={`/market-signals/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                      {line && <div className={s.status === "FAILED" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{line}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Market report</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{periodLabel(s.periodFrom, s.periodTo)}</TableCell>
                    <TableCell className="text-sm">{total ? `${total} · ${s.counts?.MAPPED ?? 0} mapped` : "—"}</TableCell>
                    <TableCell className="text-sm">{proposals ? `${proposals} pending` : "—"}</TableCell>
                    <TableCell>
                      <SourceStatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Link href={`/market-signals/${s.id}`} className="text-sm text-primary hover:underline">
                        {s.status === "IN_REVIEW" ? "Review" : "Open"}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell className="pl-6">
                  <div className="font-medium">Latest assessments</div>
                  <div className="text-xs text-muted-foreground">Built-in · per employee, from assessments and roadmap progress</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">Assessment</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">live</TableCell>
                <TableCell className="text-sm">per person</TableCell>
                <TableCell className="text-sm">—</TableCell>
                <TableCell>
                  <Badge variant="success">Active</Badge>
                </TableCell>
                <TableCell className="pr-6" />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE.map(([name, body], i) => (
          <Card key={name}>
            <CardContent className="space-y-1 py-4">
              <div className="font-mono text-xs text-primary">{String(i + 1).padStart(2, "0")}</div>
              <div className="text-sm font-semibold">{name}</div>
              <p className="text-xs text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SourceTile(props: { title: string; body: string; active?: boolean; dashed?: boolean; later?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      disabled={props.later}
      onClick={props.onClick}
      className={[
        "rounded-xl border p-4 text-left transition-colors",
        props.dashed ? "border-dashed" : "",
        props.active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        props.later ? "cursor-not-allowed bg-muted/40 opacity-70 hover:bg-muted/40" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {props.title}
        {props.later && <Badge variant="secondary">Later</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{props.body}</p>
    </button>
  );
}
