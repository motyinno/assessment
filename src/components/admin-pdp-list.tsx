"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManagerCombobox } from "@/components/manager-combobox";

const PAGE_SIZE = 20;

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
  user: { id: string; name: string; email: string; isArchived: boolean; manager: { name: string } | null };
}

export function AdminPdpList() {
  const router = useRouter();
  const [rows, setRows] = useState<PdpRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>("ACTIVE");
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change starts back at page 1.
  useEffect(() => {
    setPage(1);
  }, [status, userId, debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ status, page: String(page), pageSize: String(PAGE_SIZE) });
    if (userId) params.set("userId", userId);
    if (debouncedSearch) params.set("q", debouncedSearch);

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
  }, [status, userId, debouncedSearch, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger>
              <SelectValue>
                {(v: unknown) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? "Active"}
              </SelectValue>
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
        <div className="space-y-2">
          <Label>Employee</Label>
          <ManagerCombobox value={userId} onChange={setUserId} placeholder="Any employee" />
        </div>
        <div className="space-y-2">
          <Label>PDP</Label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by plan name or topic"
          />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !fetching && rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No PDPs match these filters.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={fetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>PDP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Created</TableHead>
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
                        <TableCell>
                          <p className="text-sm font-medium truncate">{p.user.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{p.user.email}</p>
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate" title={p.fileName}>
                          {p.fileName.replace(/\.docx$/i, "")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {p.progress == null ? "—" : `${p.progress}%`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.user.manager?.name ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("en-US")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
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
