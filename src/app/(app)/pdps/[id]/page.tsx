"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, Code2, ExternalLink, FileCheck2, Loader2, RefreshCw, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdpBuilder, type BuilderGoal, type BuilderStatus, type MatrixOption } from "@/components/pdp-builder";
import { PdpProgressView, type ProgressGoal, type ProgressItem } from "@/components/pdp-progress-view";
import { apiErrorMessage } from "@/lib/api-error";
import { progressPercent } from "@/lib/pdp-progress";

type PdpItem = ProgressItem;
interface PdpGoal extends ProgressGoal {
  matrixTopicId: string | null;
  items: PdpItem[];
}
interface PdpView {
  id: string;
  status: "GENERATING" | "DRAFT" | "ACTIVE" | "COMPLETED" | "FAILED" | "ON_REVIEW";
  error: string | null;
  driveLink: string | null;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  completedBy: { name: string } | null;
  docSyncedAt: string | null;
  goals: PdpGoal[];
  user: { id: string; name: string; gradeLabel: string; manager: { name: string } | null };
  approvedBy: { name: string } | null;
  createdBy: { name: string } | null;
  assessment: { id: string; title: string } | null;
  canEdit: boolean;
  canRetry: boolean;
  isOwner: boolean;
  canComplete: boolean;
  docStale: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  GENERATING: "Generating",
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  FAILED: "Failed",
};
const STATUS_VARIANTS: Record<string, "warning" | "info" | "success" | "destructive" | "secondary"> = {
  GENERATING: "info",
  DRAFT: "warning",
  ACTIVE: "success",
  COMPLETED: "secondary",
  FAILED: "destructive",
};

async function errorFrom(res: Response, fallback: string): Promise<string> {
  return apiErrorMessage(await res.json().catch(() => null), fallback);
}

function ReadOnlyPlan({ goals }: { goals: PdpGoal[] }) {
  return (
    <div className="space-y-3">
      {goals.map((g, gi) => (
        <section key={g.id} className="rounded-xl border bg-card px-4 py-3.5 shadow-xs">
          <header className="flex items-center gap-2.5 pb-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
              {gi + 1}
            </span>
            <h3 className="text-[15px] font-semibold">{g.title}</h3>
          </header>
          <div className="space-y-2 pl-[2.125rem]">
            <ul className="space-y-1.5 text-sm">
              {g.items
                .filter((i) => i.type === "THEORY")
                .map((i) => (
                  <li key={i.id} className="flex gap-2">
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    {i.text}
                  </li>
                ))}
            </ul>
            {g.items
              .filter((i) => i.type === "PRACTICE")
              .map((i) => (
                <div key={i.id} className="flex gap-2 rounded-lg bg-muted/50 px-2 py-1.5 text-sm">
                  <Code2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="whitespace-pre-line">{i.text}</span>
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export default function PdpPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [pdp, setPdp] = useState<PdpView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matrixOptions, setMatrixOptions] = useState<MatrixOption[]>([]);
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);
  const [builder, setBuilder] = useState<BuilderStatus | null>(null);
  // Active plans: the manager switches between checking progress and editing.
  const [view, setView] = useState<"progress" | "edit">("progress");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/pdps/${id}`);
    if (!res.ok) {
      setLoadError(await errorFrom(res, "Couldn't load the PDP"));
      return null;
    }
    const data = (await res.json()) as PdpView;
    setPdp(data);
    return data;
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Matrix topics for "Topic from matrix" — only needed when editing.
  useEffect(() => {
    if (!pdp?.canEdit) return;
    const qs = pdp.assessment ? `?assessmentId=${pdp.assessment.id}` : "";
    fetch(`/api/users/${pdp.user.id}/pdp-options${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { sections: Array<{ title: string; topics: Array<{ id: string; title: string; score: number | null }> }> } | null) => {
        if (!d) return;
        setMatrixOptions(d.sections.flatMap((s) => s.topics.map((t) => ({ ...t, sectionTitle: s.title }))));
      });
  }, [pdp?.canEdit, pdp?.user.id, pdp?.assessment]);

  // The AI draft is written in the background; poll until it lands.
  useEffect(() => {
    if (pdp?.status !== "GENERATING") return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [pdp?.status, load]);

  async function approve() {
    if (!pdp) return;
    setApproving(true);
    setActionError(null);
    try {
      if (flushRef.current && !(await flushRef.current())) throw new Error("Save your changes first — the last save failed");
      const res = await fetch(`/api/pdps/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't create the Google Doc"));
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  async function complete() {
    setCompleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/pdps/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: completionNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await errorFrom(res, "Couldn't close the PDP"));
      setCompleteOpen(false);
      setView("progress");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      setCompleteOpen(false);
    } finally {
      setCompleting(false);
    }
  }

  async function switchView(next: "progress" | "edit") {
    if (next === view) return;
    if (next === "progress") {
      // Save pending edits, then reload so new items/topics show their status.
      if (flushRef.current) await flushRef.current();
      setBuilder(null);
      await load();
    }
    setView(next);
  }

  async function retry() {
    setActionError(null);
    const res = await fetch(`/api/pdps/${id}/retry`, { method: "POST" });
    if (!res.ok) setActionError(await errorFrom(res, "Couldn't retry"));
    await load();
  }

  async function remove() {
    const res = await fetch(`/api/pdps/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setActionError(await errorFrom(res, "Couldn't delete"));
      setConfirmDelete(false);
      return;
    }
    setConfirmDelete(false);
    // Full navigation, not router.push: the soft navigation stalled after the
    // delete (dialog stayed open), and the profile must refetch its PDP list.
    window.location.assign(`/users/${pdp?.user.id}`);
  }

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!pdp) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const isDraft = pdp.status === "DRAFT";
  const legacy = pdp.goals.length === 0 && !!pdp.driveLink;
  const editing = pdp.canEdit && !legacy;
  const tracking = (pdp.status === "ACTIVE" || pdp.status === "COMPLETED") && !legacy;
  const showBuilder = editing && (isDraft || view === "edit");
  // The employee gets the plan alone, full width: no doc link or plan metadata.
  const ownerView = pdp.isOwner && tracking;
  const doneItems = pdp.goals.reduce((n, g) => n + g.items.filter((i) => i.doneAt).length, 0);
  const allItems = pdp.goals.reduce((n, g) => n + g.items.length, 0);
  const counts = builder ?? {
    topics: pdp.goals.length,
    questions: pdp.goals.reduce((n, g) => n + g.items.filter((i) => i.type === "THEORY").length, 0),
    tasks: pdp.goals.reduce((n, g) => n + g.items.filter((i) => i.type === "PRACTICE").length, 0),
  };
  const showPlanLayout = pdp.status !== "GENERATING" && pdp.status !== "FAILED";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/users/${pdp.user.id}`} className="hover:text-foreground">
            {pdp.user.name}
          </Link>
          <span>/</span>
          <span>Development plan</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{pdp.user.name}</h1>
          <Badge variant={STATUS_VARIANTS[pdp.status] ?? "secondary"}>{STATUS_LABELS[pdp.status] ?? pdp.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Personal development plan · {pdp.user.gradeLabel}</p>
        {ownerView && (
          <div className="max-w-md space-y-1.5 pt-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">
                {pdp.status === "COMPLETED"
                  ? `Completed${pdp.completedAt ? ` ${new Date(pdp.completedAt).toLocaleDateString()}` : ""}`
                  : `${doneItems} of ${allItems} items done`}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">{progressPercent({ done: doneItems, total: allItems })}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${progressPercent({ done: doneItems, total: allItems })}%` }}
              />
            </div>
            {pdp.status === "COMPLETED" && pdp.completionNote && (
              <p className="pt-1 text-sm text-muted-foreground">
                {pdp.completedBy?.name ?? "Your manager"}: {pdp.completionNote}
              </p>
            )}
          </div>
        )}
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {pdp.status === "GENERATING" && (
        <Card className="max-w-2xl">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="font-medium text-foreground">Drafting the plan…</p>
            <p>The AI is writing questions and tasks. The builder opens here when it&apos;s ready.</p>
          </CardContent>
        </Card>
      )}

      {pdp.status === "FAILED" && (
        <Card className="max-w-2xl">
          <CardContent className="space-y-3 py-6 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive">
              <AlertTriangle className="size-4" /> {pdp.error ?? "Generation failed."}
            </p>
            {pdp.canRetry && (
              <div className="flex gap-2">
                <Button onClick={retry}>
                  <RotateCw /> Retry
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showPlanLayout && (
        <div className={ownerView ? "max-w-4xl" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start"}>
          <div className="min-w-0 space-y-3">
            {editing && tracking && pdp.status === "ACTIVE" && (
              <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-sm">
                {(["progress", "edit"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => void switchView(v)}
                    className={
                      "rounded-md px-3 py-1 transition-colors " +
                      (view === v ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {v === "progress" ? "Progress" : "Edit plan"}
                  </button>
                ))}
              </div>
            )}
            {legacy ? (
              <Card>
                <CardContent className="space-y-2 py-6 text-sm">
                  <p>This plan was created before the builder — its content lives in the Google Doc.</p>
                  {pdp.driveLink && (
                    <a href={pdp.driveLink} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      Open the Google Doc
                    </a>
                  )}
                </CardContent>
              </Card>
            ) : showBuilder ? (
              <PdpBuilder
                key={pdp.id}
                pdpId={pdp.id}
                initialGoals={pdp.goals as BuilderGoal[]}
                matrixOptions={matrixOptions}
                flushRef={flushRef}
                onStatus={setBuilder}
                onSaved={() => {
                  if (pdp.status === "ACTIVE") setPdp((p) => (p ? { ...p, docStale: true } : p));
                }}
              />
            ) : tracking ? (
              <PdpProgressView
                pdpId={pdp.id}
                goals={pdp.goals}
                editable={pdp.isOwner && pdp.status === "ACTIVE"}
                onGoalsChange={(fn) =>
                  setPdp((p) => (p ? { ...p, goals: fn(p.goals) as PdpGoal[] } : p))
                }
              />
            ) : (
              <ReadOnlyPlan goals={pdp.goals} />
            )}
          </div>

          {!ownerView && (
          <aside className="space-y-3 lg:sticky lg:top-6">
            <Card>
              <CardContent className="space-y-4 py-4">
                {pdp.status === "COMPLETED" && (
                  <div className="space-y-1 rounded-lg bg-success/15 px-3 py-2 text-sm">
                    <p className="flex items-center gap-2 font-medium text-success">
                      <Check className="size-4" /> Completed
                      {pdp.completedAt ? ` ${new Date(pdp.completedAt).toLocaleDateString()}` : ""}
                    </p>
                    {pdp.completedBy && <p className="text-xs text-muted-foreground">Closed by {pdp.completedBy.name}</p>}
                    {pdp.completionNote && <p className="whitespace-pre-line">{pdp.completionNote}</p>}
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {isDraft && editing
                    ? `Only you can see this draft. Approving creates the Google Doc and shows the plan to ${pdp.user.name}.`
                    : pdp.status === "ACTIVE" && showBuilder
                      ? `${pdp.user.name} sees this plan. Edits here need "Update Google Doc" to reach the document.`
                      : pdp.status === "ACTIVE" && pdp.canComplete && legacy
                        ? "This plan lives in a Google Doc, so progress isn't tracked here. Close it when it's done to stop counting it as active."
                      : pdp.status === "ACTIVE" && pdp.canComplete
                        ? `${pdp.user.name} ticks what's done and links their work. Close the plan when you're satisfied — not every item has to be ticked.`
                        : null}
                </p>

                {tracking && !showBuilder && (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">
                        {doneItems} of {allItems} items done
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {progressPercent({ done: doneItems, total: allItems })}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-success transition-all"
                        style={{ width: `${progressPercent({ done: doneItems, total: allItems })}%` }}
                      />
                    </div>
                  </div>
                )}

                {!legacy && (!tracking || showBuilder) && (
                  <div className="grid grid-cols-3 divide-x rounded-lg border text-center">
                    {[
                      ["Topics", counts.topics],
                      ["Questions", counts.questions],
                      ["Tasks", counts.tasks],
                    ].map(([label, n]) => (
                      <div key={label as string} className="py-2">
                        <div className="text-lg font-semibold leading-tight">{n}</div>
                        <div className="text-[11px] text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {editing && pdp.status === "ACTIVE" && pdp.docStale && (
                  <p className="flex gap-2 rounded-lg bg-warning/15 px-3 py-2 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    The plan changed since the Google Doc was last updated.
                  </p>
                )}

                <div className="space-y-2">
                  {pdp.canComplete && !showBuilder && (
                    <Button className="w-full" onClick={() => setCompleteOpen(true)}>
                      <CheckCircle2 /> Close PDP
                    </Button>
                  )}
                  {pdp.canEdit && isDraft && (
                    <Button
                      className="w-full"
                      onClick={approve}
                      disabled={approving || (!legacy && counts.topics === 0)}
                    >
                      {approving ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
                      {legacy ? "Approve" : "Approve and create Google Doc"}
                    </Button>
                  )}
                  {editing && pdp.status === "ACTIVE" && (
                    <Button className="w-full" variant={pdp.docStale ? "default" : "outline"} onClick={approve} disabled={approving}>
                      {approving ? <Loader2 className="animate-spin" /> : <RefreshCw />} Update Google Doc
                    </Button>
                  )}
                  {pdp.driveLink && (
                    <a href={pdp.driveLink} target="_blank" rel="noreferrer" className="block">
                      <Button variant="outline" className="w-full">
                        <ExternalLink /> Open Google Doc
                      </Button>
                    </a>
                  )}
                </div>

                {editing && builder && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {builder.saveState === "saving" && (
                      <>
                        <Loader2 className="size-3 animate-spin" /> Saving…
                      </>
                    )}
                    {(builder.saveState === "saved" || builder.saveState === "idle") && (
                      <>
                        <Check className="size-3" /> All changes saved
                      </>
                    )}
                    {builder.saveState === "error" && (
                      <span className="text-destructive">
                        {builder.saveError}{" "}
                        <button type="button" className="underline" onClick={builder.retrySave}>
                          Retry
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 py-4">
                <Meta label="Employee">
                  <Link href={`/users/${pdp.user.id}`} className="hover:underline">
                    {pdp.user.name}
                  </Link>
                </Meta>
                <Meta label="Manager">{pdp.user.manager?.name ?? "—"}</Meta>
                {pdp.assessment && (
                  <Meta label="Based on">
                    <Link href={`/assessments/${pdp.assessment.id}`} className="line-clamp-2 hover:underline">
                      {pdp.assessment.title}
                    </Link>
                  </Meta>
                )}
                {pdp.approvedBy && pdp.approvedAt && (
                  <Meta label="Approved">
                    {pdp.approvedBy.name}, {new Date(pdp.approvedAt).toLocaleDateString()}
                  </Meta>
                )}
                <Meta label="Created">{new Date(pdp.createdAt).toLocaleDateString()}</Meta>
              </CardContent>
            </Card>

            {pdp.canEdit && isDraft && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Delete draft
              </button>
            )}
          </aside>
          )}
        </div>
      )}

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close this PDP?</DialogTitle>
            <DialogDescription>
              {pdp.user.name} has done {doneItems} of {allItems} items. Closing marks the plan completed and makes it
              read-only.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            rows={3}
            placeholder="A closing comment for the employee — optional"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={complete} disabled={completing}>
              {completing ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Close PDP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this PDP?</DialogTitle>
            <DialogDescription>The draft and its topics are removed. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
