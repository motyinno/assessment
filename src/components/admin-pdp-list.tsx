"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManagerCombobox } from "@/components/manager-combobox";
import { UserAvatar } from "@/components/user-avatar";

const PAGE_SIZE = 20;
const DEFAULT_STATUS = "ACTIVE";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DRAFT", label: "Draft" },
  { value: "ALL", label: "All statuses" },
] as const;

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "secondary" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  DRAFT: { label: "Draft", variant: "warning" },
  ON_REVIEW: { label: "On review", variant: "warning" },
};

interface PdpRow {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
  progress: number | null;
  user: {
    id: string;
    name: string;
    email: string;
    isArchived: boolean;
    photoFileName: string | null;
    manager: { name: string } | null;
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminPdpList() {
  const router = useRouter();
  const [rows, setRows] = useState<PdpRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>(DEFAULT_STATUS);
  const [userId, setUserId] = useState<string | null>(null);

  // Any filter change starts back at page 1.
  useEffect(() => {
    setPage(1);
  }, [status, userId]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (userId) params.set("userId", userId);

    setFetching(true);
    fetch(`/api/admin/pdps?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't load PDPs");
        const data = await res.json();
        setRows(data.items);
        setTotal(data.total);
        setError(null);
        setFetching(false);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Couldn't load PDPs");
        setFetching(false);
      });
    return () => controller.abort();
  }, [status, userId, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = status !== DEFAULT_STATUS || !!userId;

  return (
    <div className="space-y-4">
      {/* overflow-visible: the employee dropdown has to spill out of the card */}
      <Card className="overflow-visible">
        <CardContent className="flex flex-wrap items-start gap-4 py-4">
          <div className="w-full space-y-1.5 sm:w-48">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: unknown) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? "Active"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full min-w-0 flex-1 space-y-1.5 sm:min-w-64">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Employee</Label>
            <ManagerCombobox value={userId} onChange={setUserId} placeholder="Any employee" />
          </div>
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:mt-6"
              onClick={() => {
                setStatus(DEFAULT_STATUS);
                setUserId(null);
              }}
            >
              Reset
            </Button>
          )}
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !fetching && rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No PDPs found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filtered ? "Try a different status or employee." : "There are no active PDPs in your division yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={fetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Employee</TableHead>
                    <TableHead>PDP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44">Progress</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead className="pr-5">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const badge = STATUS_BADGE[p.status] ?? { label: p.status, variant: "secondary" as const };
                    return (
                      <TableRow
                        key={p.id}
                        className={"cursor-pointer" + (p.user.isArchived ? " opacity-60" : "")}
                        onClick={() => router.push(`/pdps/${p.id}`)}
                      >
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3">
                            <UserAvatar user={p.user} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{p.user.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{p.user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="truncate text-sm" title={p.fileName}>
                            {p.fileName.replace(/\.docx$/i, "")}
                          </p>
                          {p.progress == null && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <ExternalLink className="size-3" /> Google Doc, not tracked here
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.progress == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-success" style={{ width: `${p.progress}%` }} />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.user.manager?.name ?? "—"}</TableCell>
                        <TableCell className="pr-5 text-sm text-muted-foreground">{formatDate(p.createdAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || fetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pages || fetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
