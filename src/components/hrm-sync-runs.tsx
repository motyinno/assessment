"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type HrmSyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  trigger: string;
  dryRun: boolean;
  employeesSeen: number;
  usersCreated: number;
  usersUpdated: number;
  usersDismissed: number;
  usersRestored: number;
  departmentsUpserted: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  rolesGranted: number;
  adminsGranted: number;
  managersResolved: number;
  failureReason: string | null;
};

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<string, string> = {
  RUNNING: "Running",
  SUCCESS: "Success",
  PARTIAL: "Partial",
  FAILED: "Failed",
  ABORTED_GUARD: "Guard tripped",
  DRY_RUN: "Dry run",
  SKIPPED_LOCKED: "Already running",
};

const STATUS_BADGE_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "destructive" | "secondary" | "outline"
> = {
  RUNNING: "default",
  SUCCESS: "success",
  PARTIAL: "warning",
  FAILED: "destructive",
  ABORTED_GUARD: "destructive",
  DRY_RUN: "secondary",
  SKIPPED_LOCKED: "outline",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={STATUS_BADGE_VARIANT[status] ?? "secondary"}
      className={status === "RUNNING" ? "animate-pulse" : undefined}
    >
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function HrmSyncRuns() {
  const [runs, setRuns] = useState<HrmSyncRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disabledNotice, setDisabledNotice] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    const res = await fetch(`/api/hrm/sync/runs?page=${p}&pageSize=${PAGE_SIZE}`, {
      cache: "no-store",
    });
    // A redirect to /login (expired session) is followed transparently by
    // fetch and comes back as 200 with an HTML body, not JSON.
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) return;
    const data = await res.json();
    setRuns(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  // Poll every 5s only while the latest known run (page 1) is still RUNNING —
  // otherwise there's nothing changing to poll for.
  useEffect(() => {
    if (page !== 1) return;
    const last = runs[0];
    if (last?.status !== "RUNNING") return;
    const id = setInterval(() => load(1), 5000);
    return () => clearInterval(id);
  }, [runs, page, load]);

  async function trigger(dryRun: boolean) {
    setBusy(true);
    setDisabledNotice(false);
    setTriggerError(null);
    try {
      const res = await fetch(`/api/hrm/sync${dryRun ? "?dryRun=1" : ""}`, {
        method: "POST",
      });
      // A redirect to /login (expired session) is followed transparently by
      // fetch and comes back as 200 with an HTML body, not JSON — guard both
      // on content-type and res.ok so that case surfaces as a message instead
      // of an unhandled JSON.parse crash.
      const isJson = res.headers.get("content-type")?.includes("application/json");
      if (!res.ok || !isJson) {
        setTriggerError(
          res.status === 401 || res.redirected
            ? "Your session has expired — please sign in again."
            : `Failed to start sync (HTTP ${res.status}).`
        );
        return;
      }
      const data = await res.json();
      if (data && "skipped" in data) {
        setDisabledNotice(true);
        return;
      }
      setPage(1);
      await load(1);
    } catch {
      setTriggerError("Failed to start sync — unexpected response from server.");
    } finally {
      setBusy(false);
    }
  }

  const latest = page === 1 ? runs[0] : undefined;
  const isRunning = latest?.status === "RUNNING";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => trigger(false)} disabled={busy || isRunning}>
          Run now
        </Button>
        <Button variant="outline" onClick={() => trigger(true)} disabled={busy || isRunning}>
          Dry run
        </Button>
        {disabledNotice && (
          <span className="text-sm text-muted-foreground">
            HRM sync is disabled (HRM_SYNC_ENABLED=false)
          </span>
        )}
        {triggerError && (
          <span className="text-sm text-destructive">{triggerError}</span>
        )}
      </div>

      {!loading && latest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Latest run
              <StatusBadge status={latest.status} />
              {latest.dryRun && <Badge variant="outline">Dry run</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Started: {formatDateTime(latest.startedAt)}</span>
              <span>Trigger: {latest.trigger}</span>
              <span>Duration: {formatDuration(latest.startedAt, latest.finishedAt)}</span>
            </div>
            {latest.failureReason && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {latest.failureReason}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Counter label="Employees seen" value={latest.employeesSeen} />
              <Counter label="Users created" value={latest.usersCreated} />
              <Counter label="Users updated" value={latest.usersUpdated} />
              <Counter label="Dismissed" value={latest.usersDismissed} />
              <Counter label="Restored" value={latest.usersRestored} />
              <Counter label="Departments" value={latest.departmentsUpserted} />
              <Counter label="Memberships +" value={latest.membershipsAdded} />
              <Counter label="Memberships −" value={latest.membershipsRemoved} />
              <Counter label="Roles granted" value={latest.rolesGranted} />
              <Counter label="Admins granted" value={latest.adminsGranted} />
              <Counter label="Managers resolved" value={latest.managersResolved} />
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Dismissed</TableHead>
              <TableHead>Roles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No runs yet
                </TableCell>
              </TableRow>
            )}
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={run.status} />
                    {run.dryRun && <Badge variant="outline">Dry run</Badge>}
                  </div>
                </TableCell>
                <TableCell>{run.trigger}</TableCell>
                <TableCell>{formatDuration(run.startedAt, run.finishedAt)}</TableCell>
                <TableCell>{run.usersCreated}</TableCell>
                <TableCell>{run.usersUpdated}</TableCell>
                <TableCell>{run.usersDismissed}</TableCell>
                <TableCell>{run.rolesGranted}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className={cn("text-sm text-muted-foreground")}>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
