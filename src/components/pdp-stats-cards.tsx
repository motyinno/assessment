"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Stats {
  employees: number;
  withActivePdp: number;
  active: number;
  completed: number;
  drafts: number;
  avgProgress: number | null;
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

/** Headline PDP numbers for the admin's division (GET /api/admin/pdps/stats). */
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
  const pct = stats && stats.employees > 0 ? Math.round((stats.withActivePdp / stats.employees) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Tile label="Active PDPs" value={stats ? String(stats.active) : dash} />
      <Tile
        label="Employees with active PDP"
        value={stats ? `${stats.withActivePdp} of ${stats.employees}` : dash}
        hint={stats ? `${pct}% of the division` : undefined}
      />
      <Tile label="Completed" value={stats ? String(stats.completed) : dash} />
      <Tile label="Drafts" value={stats ? String(stats.drafts) : dash} hint="Not yet approved" />
      <Tile
        label="Avg progress"
        value={stats?.avgProgress == null ? dash : `${stats.avgProgress}%`}
        hint="Active plans tracked in the app"
      />
    </div>
  );
}
