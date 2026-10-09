"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CoverageRow {
  id: string;
  name: string;
  people: number;
  withActivePdp: number;
}

interface Stats {
  employees: number;
  withActivePdp: number;
  active: number;
  departments: CoverageRow[];
  managers: CoverageRow[];
}

const PAGE_SIZE = 8;

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

type SortKey = "name" | "people" | "coverage";

const ratio = (r: CoverageRow) => (r.people > 0 ? r.withActivePdp / r.people : 0);

/** Share of people covered by an active PDP, one row per department / manager. */
function CoverageCard({
  title,
  caption,
  nameLabel,
  peopleLabel,
  rows,
  filterable = false,
  defaultSort = { key: "people", dir: "desc" },
}: {
  title: string;
  caption: string;
  nameLabel: string;
  peopleLabel: string;
  rows: CoverageRow[];
  /** Adds a name search and an "only without a PDP" toggle (long lists). */
  filterable?: boolean;
  defaultSort?: { key: SortKey; dir: "asc" | "desc" };
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort);
  const [search, setSearch] = useState("");
  const [onlyUncovered, setOnlyUncovered] = useState(false);

  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!onlyUncovered || r.withActivePdp === 0))
    .sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      const byKey =
        sort.key === "name"
          ? a.name.localeCompare(b.name)
          : sort.key === "people"
            ? a.people - b.people
            : ratio(a) - ratio(b);
      // Ties: bigger teams first, so an uncovered team of 12 outranks one of 1.
      return byKey * dir || b.people - a.people || a.name.localeCompare(b.name);
    });
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setPage(1);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");
  const headClass = "cursor-pointer select-none py-2 font-medium hover:text-foreground";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {filterable && (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={`Search ${nameLabel.toLowerCase()}`}
              className="h-8 max-w-56"
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyUncovered}
                onChange={(e) => {
                  setOnlyUncovered(e.target.checked);
                  setPage(1);
                }}
              />
              Only without an active PDP
            </label>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? "Nothing to show yet" : "No matches"}
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className={`${headClass} pr-4`} onClick={() => toggleSort("name")}>
                    {nameLabel}
                    {arrow("name")}
                  </th>
                  <th className={`${headClass} pr-4 text-right`} onClick={() => toggleSort("people")}>
                    {peopleLabel}
                    {arrow("people")}
                  </th>
                  <th className={headClass} onClick={() => toggleSort("coverage")}>
                    With active PDP{arrow("coverage")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const p = pct(r.withActivePdp, r.people);
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="max-w-[220px] truncate py-2 pr-4" title={r.name}>
                        {r.name}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{r.people}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-success" style={{ width: `${p}%` }} />
                          </div>
                          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {r.withActivePdp} ({p}%)
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length > PAGE_SIZE && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, shown.length)} of {shown.length}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                    Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** PDP numbers and coverage for the admin's division (GET /api/admin/pdps/stats). */
export function PdpStatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/admin/pdps/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setStats)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <p className="text-sm text-destructive">Couldn&apos;t load PDP statistics</p>;
  const dash = "—";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Tile label="Active PDPs" value={stats ? String(stats.active) : dash} />
        <Tile
          label="Employees with active PDP"
          value={stats ? `${stats.withActivePdp} of ${stats.employees}` : dash}
          hint={stats ? `${pct(stats.withActivePdp, stats.employees)}% of the division` : undefined}
        />
      </div>
      {stats && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CoverageCard
            title="Coverage by department"
            caption="Employees of the whole department who have an active PDP."
            nameLabel="Department"
            peopleLabel="Employees"
            rows={stats.departments}
          />
          <CoverageCard
            title="Coverage by manager"
            caption="Direct reports of each manager who have an active PDP. Lowest coverage first."
            nameLabel="Manager"
            peopleLabel="Employees"
            rows={stats.managers}
            filterable
            // Worst-covered first: that's the list an admin acts on.
            defaultSort={{ key: "coverage", dir: "asc" }}
          />
        </div>
      )}
    </div>
  );
}
