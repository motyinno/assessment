"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ActivityStats } from "@/lib/activity";

const ROLE_LABEL: Record<string, string> = { USER: "Employees", ASSESSOR: "Assessors", MANAGER: "Managers", ADMIN: "Admins" };

function ago(iso: string | null, now: number): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ActivityView({ stats }: { stats: ActivityStats }) {
  const now = new Date(stats.generatedAt).getTime();
  const router = useRouter();
  const showDivision = (id: string | null) =>
    router.push(id ? `/admin/activity?division=${encodeURIComponent(id)}` : "/admin/activity");
  const [query, setQuery] = useState("");
  const [onlyQuiet, setOnlyQuiet] = useState(false);
  const users = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stats.users.filter(
      (u) =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!onlyQuiet || u.signIns + u.views === 0)
    );
  }, [stats.users, query, onlyQuiet]);
  const chart = stats.daily.map((d) => ({ ...d, label: d.day.slice(5).replace("-", ".") }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Activity{stats.division ? ` · ${stats.division.name}` : ""}</h1>
          <p className="page-subtitle mt-1">
            Who uses the app and how. Visible to super admins only; events are kept for 180 days.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Division
          <select
            value={stats.division?.id ?? ""}
            onChange={(e) => showDivision(e.target.value || null)}
            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
          >
            <option value="">All divisions</option>
            {stats.divisions
              .filter((d) => d.id)
              .map((d) => (
                <option key={d.id} value={d.id!}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Active today" value={stats.active.today} />
        <Kpi label="Active, 7 days" value={stats.active.week} />
        <Kpi label="Active, 30 days" value={stats.active.month} hint={`of ${stats.totalUsers} users`} />
        <Kpi label="Sign-ins, 7 days" value={stats.signInsWeek} />
        <Kpi label="Never seen" value={stats.neverSeen} hint="no sign-in or visit recorded" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily active users</CardTitle>
            <CardDescription>Last 30 days, UTC days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" interval={4} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--popover-foreground)",
                  }}
                  formatter={(value, name) => [value, name === "users" ? "Active users" : "Page views"]}
                  labelFormatter={(_, p) => p?.[0]?.payload ? `${p[0].payload.day} · ${p[0].payload.views} views` : ""}
                />
                <Bar dataKey="users" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By role</CardTitle>
            <CardDescription>Active in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.byRole
              .filter((r) => r.total > 0)
              .map((r) => {
                const pct = Math.round((r.active / r.total) * 100);
                return (
                  <div key={r.role}>
                    <div className="flex justify-between text-sm">
                      <span>{ROLE_LABEL[r.role] ?? r.role}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {r.active} / {r.total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By division</CardTitle>
          <CardDescription>Last 30 days, across everyone. Click a division to narrow the page to it.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Division</TableHead>
                <TableHead className="w-[38%]">Active people</TableHead>
                <TableHead className="text-right">Sign-ins</TableHead>
                <TableHead className="text-right">Views</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.divisions.map((d) => {
                const pct = d.total ? Math.round((d.active / d.total) * 100) : 0;
                const current = stats.division?.id === d.id;
                return (
                  <TableRow
                    key={d.id ?? "none"}
                    onClick={d.id ? () => showDivision(current ? null : d.id) : undefined}
                    className={cn(d.id && "cursor-pointer", current && "bg-muted/60")}
                  >
                    <TableCell className={cn("font-medium", !d.id && "text-muted-foreground")}>{d.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                          {d.active} / {d.total} · {pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.signIns}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.views}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
            <CardDescription>Views in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">People</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topPages.map((p) => (
                    <TableRow key={p.path}>
                      <TableCell className="font-mono text-xs">{p.path}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.views}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.users}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sign-ins</CardTitle>
            <CardDescription>Latest 30</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentSignIns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sign-ins recorded yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {stats.recentSignIns.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/users/${s.userId}`} className="truncate hover:underline">
                      {s.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground" title={when(s.at)}>
                      {ago(s.at, now)}
                      {s.provider && s.provider !== "google" ? ` · ${s.provider}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>Last seen ever; sign-ins and page views over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className="max-w-xs"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyQuiet} onChange={(e) => setOnlyQuiet(e.target.checked)} />
              Only inactive in 30 days
            </label>
            <span className="text-xs text-muted-foreground">{users.length} shown</span>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  {!stats.division && <TableHead>Division</TableHead>}
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Sign-ins</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                        {u.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ROLE_LABEL[u.role]?.replace(/s$/, "") ?? u.role}</TableCell>
                    {!stats.division && <TableCell className="text-xs text-muted-foreground">{u.division ?? "—"}</TableCell>}
                    <TableCell className={cn("text-sm", !u.lastSeen && "text-muted-foreground")} title={u.lastSeen ? when(u.lastSeen) : undefined}>
                      {ago(u.lastSeen, now)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.signIns}</TableCell>
                    <TableCell className="text-right tabular-nums">{u.views}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
