"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  completed: number;
  drafts: number;
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

/** Share of people covered by an active PDP, one row per department / manager. */
function CoverageCard({
  title,
  caption,
  nameLabel,
  peopleLabel,
  rows,
}: {
  title: string;
  caption: string;
  nameLabel: string;
  peopleLabel: string;
  rows: CoverageRow[];
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show yet</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">{nameLabel}</th>
                  <th className="py-2 pr-4 text-right font-medium">{peopleLabel}</th>
                  <th className="py-2 font-medium">With active PDP</th>
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
            {pages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Page {page} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Active PDPs" value={stats ? String(stats.active) : dash} />
        <Tile label="Completed" value={stats ? String(stats.completed) : dash} />
        <Tile label="Drafts" value={stats ? String(stats.drafts) : dash} hint="Not yet approved" />
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
            caption="Employees of each department who have an active PDP. Someone in several departments counts in each."
            nameLabel="Department"
            peopleLabel="People"
            rows={stats.departments}
          />
          <CoverageCard
            title="Coverage by manager"
            caption="Direct reports of each manager who have an active PDP."
            nameLabel="Manager"
            peopleLabel="Reports"
            rows={stats.managers}
          />
        </div>
      )}
    </div>
  );
}
