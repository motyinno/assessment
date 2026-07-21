"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { GRADE_VALUES, gradeLabel } from "@/lib/grades";

export interface AssessmentRow {
  id: string;
  status: string;
  grade: string;
  completedAt: string | null; // ISO
  reviewStatus: string;
  gradeUpgraded: boolean;
  // Everyone who conducted this assessment: assigned assessors + whoever ran a
  // completed stage. Deduplicated server-side.
  conductors: { id: string; name: string }[];
  // The people who were assessed (SUBJECT participants) — usually one.
  subjects: { id: string; name: string }[];
}

type PeriodKey = "1m" | "3m" | "6m" | "12m" | "all";

const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: "1m", label: "1 month", days: 30 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "6m", label: "6 months", days: 180 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Theme-friendly palette.
const PRIMARY = "#6366f1"; // indigo
const SUCCESS = "#22c55e"; // green
const MUTED = "#94a3b8"; // slate

const tooltipStyle = {
  background: "var(--popover, #fff)",
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground, #111)",
} as const;

// ---------- derived-data helpers ----------

function shortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortMonth(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

interface TrendDatum {
  bucket: string;
  count: number;
  // Names of the people assessed in this bucket, for the hover tooltip.
  people: string[];
}

/** One completed assessment reduced to what the trend needs: when + who. */
interface TrendItem {
  date: Date;
  people: string[];
}

/**
 * Build a time-series for the trend chart whose granularity adapts to the
 * selected period: weekly buckets for short ranges, monthly for longer ones.
 * Each bucket also collects the names of the people assessed for the tooltip.
 */
function buildTrend(items: TrendItem[], period: PeriodKey, now: number): TrendDatum[] {
  const weekly = period === "1m" || period === "3m";

  if (weekly) {
    const weeks = period === "1m" ? 5 : 13;
    const buckets = Array.from({ length: weeks }, (_, idx) => {
      const i = weeks - 1 - idx;
      const end = now - i * 7 * DAY_MS;
      const start = end - 7 * DAY_MS;
      return { start, end, bucket: shortDay(new Date(end)), count: 0, people: [] as string[] };
    });
    for (const it of items) {
      const t = it.date.getTime();
      const b = buckets.find((x) => t > x.start && t <= x.end);
      if (b) {
        b.count += 1;
        b.people.push(...it.people);
      }
    }
    return buckets.map(({ bucket, count, people }) => ({ bucket, count, people }));
  }

  // monthly
  const nowDate = new Date(now);
  let months: number;
  if (period === "6m") months = 6;
  else if (period === "12m") months = 12;
  else {
    // all time — span from earliest completed date to now (capped)
    if (items.length === 0) {
      months = 12;
    } else {
      const earliest = new Date(Math.min(...items.map((it) => it.date.getTime())));
      const diff =
        (nowDate.getFullYear() - earliest.getFullYear()) * 12 +
        (nowDate.getMonth() - earliest.getMonth()) +
        1;
      months = Math.min(Math.max(diff, 1), 36);
    }
  }

  const buckets: { key: string; bucket: string; count: number; people: string[] }[] = [];
  const byKey = new Map<string, { count: number; people: string[] }>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = { key, bucket: shortMonth(d), count: 0, people: [] as string[] };
    buckets.push(b);
    byKey.set(key, b);
  }
  for (const it of items) {
    const b = byKey.get(`${it.date.getFullYear()}-${it.date.getMonth()}`);
    if (b) {
      b.count += 1;
      b.people.push(...it.people);
    }
  }
  return buckets.map(({ bucket, count, people }) => ({ bucket, count, people }));
}

/** Shared tooltip that lists the people behind a count, with overflow capped. */
function PeopleTooltip({
  active,
  payload,
  label,
  countLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: { count: number; people: string[] } }>;
  label?: string | number;
  countLabel: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload;
  const people = datum.people ?? [];
  const MAX = 12;
  const shown = people.slice(0, MAX);
  const extra = people.length - shown.length;
  return (
    <div style={tooltipStyle} className="px-3 py-2 shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {datum.count} {countLabel}
      </p>
      {shown.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-t border-border/60 pt-1.5">
          {shown.map((name, i) => (
            <li key={`${name}-${i}`} className="truncate">
              {name}
            </li>
          ))}
          {extra > 0 && (
            <li className="text-muted-foreground">+{extra} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------- small presentational pieces ----------

type StatTone = "primary" | "success" | "warning" | "muted";

const TONE_STYLES: Record<StatTone, { icon: string; ring: string }> = {
  primary: { icon: "bg-primary/10 text-primary", ring: "ring-primary/10" },
  success: { icon: "bg-success/15 text-success", ring: "ring-success/10" },
  warning: { icon: "bg-warning/20 text-warning-foreground dark:text-warning", ring: "ring-warning/20" },
  muted: { icon: "bg-muted text-muted-foreground", ring: "ring-border" },
};

function StatCard({
  label,
  value,
  icon,
  tone = "primary",
  footer,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: StatTone;
  footer?: React.ReactNode;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm ring-1", styles.ring)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
          {footer}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ---------- main view ----------

export function AssessmentStatisticsView({ rows }: { rows: AssessmentRow[] }) {
  const [period, setPeriod] = useState<PeriodKey>("12m");
  // Single timestamp anchor so all derived data agrees within a render.
  const now = useMemo(() => Date.now(), []);

  const periodMeta = PERIODS.find((p) => p.key === period)!;
  const periodDays = periodMeta.days;

  const completedInPeriod = useMemo(
    () =>
      rows.filter((r) => {
        if (r.status !== "COMPLETED" || !r.completedAt) return false;
        if (periodDays == null) return true;
        return new Date(r.completedAt).getTime() >= now - periodDays * DAY_MS;
      }),
    [rows, periodDays, now]
  );

  const gradeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    const people = new Map<string, string[]>();
    for (const r of completedInPeriod) {
      counts.set(r.grade, (counts.get(r.grade) ?? 0) + 1);
      const names = people.get(r.grade) ?? [];
      names.push(...r.subjects.map((s) => s.name));
      people.set(r.grade, names);
    }
    const ordered = (GRADE_VALUES as readonly string[]).filter((g) => counts.has(g));
    const extra = [...counts.keys()].filter((g) => !(GRADE_VALUES as readonly string[]).includes(g));
    return [...ordered, ...extra].map((grade) => ({
      grade,
      label: gradeLabel(grade),
      count: counts.get(grade) ?? 0,
      people: people.get(grade) ?? [],
    }));
  }, [completedInPeriod]);

  const conductors = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const r of completedInPeriod) {
      for (const c of r.conductors) {
        const entry = counts.get(c.id) ?? { name: c.name, count: 0 };
        entry.count += 1;
        counts.set(c.id, entry);
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [completedInPeriod]);

  const upgrade = useMemo(() => {
    const reviewed = completedInPeriod.filter((r) => r.reviewStatus === "REVIEWED");
    const upgraded = reviewed.filter((r) => r.gradeUpgraded).length;
    return {
      upgraded,
      notUpgraded: reviewed.length - upgraded,
      total: reviewed.length,
      rate: reviewed.length > 0 ? upgraded / reviewed.length : 0,
    };
  }, [completedInPeriod]);

  const trend = useMemo(
    () =>
      buildTrend(
        completedInPeriod.map((r) => ({
          date: new Date(r.completedAt!),
          people: r.subjects.map((s) => s.name),
        })),
        period,
        now
      ),
    [completedInPeriod, period, now]
  );

  const upgradePie = [
    { name: "Upgraded", value: upgrade.upgraded, color: SUCCESS },
    { name: "Not upgraded", value: upgrade.notUpgraded, color: MUTED },
  ];
  const hasGrades = gradeDistribution.some((g) => g.count > 0);
  const hasConductors = conductors.length > 0;
  const hasTrend = trend.some((m) => m.count > 0);

  const trendTitle =
    period === "1m" || period === "3m"
      ? "Completed per week"
      : "Completed per month";

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground mr-1">
          Period
        </span>
        {PERIODS.map((p) => {
          const active = p.key === period;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={
                "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-all " +
                (active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground hover:text-foreground ring-1 ring-border hover:ring-primary/30")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* KPI cards (period-sensitive, except the all-time total) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total assessments"
          value={rows.length}
          tone="primary"
          footer={<p className="text-xs text-muted-foreground">All time</p>}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          }
        />
        <StatCard
          label="Completed"
          value={completedInPeriod.length}
          tone="success"
          footer={<p className="text-xs text-muted-foreground">{periodMeta.label}</p>}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
        />
        <StatCard
          label="Active conductors"
          value={conductors.length}
          tone="muted"
          footer={<p className="text-xs text-muted-foreground">{periodMeta.label}</p>}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
        <StatCard
          label="Grade upgrade rate"
          value={upgrade.total > 0 ? `${Math.round(upgrade.rate * 100)}%` : "—"}
          tone={upgrade.upgraded > 0 ? "success" : "muted"}
          footer={<p className="text-xs text-muted-foreground">{periodMeta.label}</p>}
          icon={
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Grade distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Grades assessed</CardTitle>
          </CardHeader>
          <CardContent>
            {hasGrades ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={gradeDistribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke={MUTED} />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.08)" }}
                    content={<PeopleTooltip countLabel="assessed" />}
                  />
                  <Bar dataKey="count" name="Assessments" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No completed assessments in this period" />
            )}
          </CardContent>
        </Card>

        {/* Trend */}
        <Card>
          <CardHeader>
            <CardTitle>
              {trendTitle} <span className="text-muted-foreground font-normal">· {periodMeta.label}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasTrend ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke={MUTED} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke={MUTED} />
                  <Tooltip content={<PeopleTooltip countLabel="completed" />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Completed"
                    stroke={PRIMARY}
                    strokeWidth={2}
                    dot={{ r: 3, fill: PRIMARY }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No completed assessments in this period" />
            )}
          </CardContent>
        </Card>

        {/* Conductor leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Assessments by conductor</CardTitle>
          </CardHeader>
          <CardContent>
            {hasConductors ? (
              <ResponsiveContainer width="100%" height={Math.max(260, conductors.length * 36)}>
                <BarChart
                  data={conductors}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke={MUTED} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11 }}
                    stroke={MUTED}
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                  <Bar dataKey="count" name="Conducted" fill={PRIMARY} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No conductors in this period" />
            )}
          </CardContent>
        </Card>

        {/* Grade upgrade rate */}
        <Card>
          <CardHeader>
            <CardTitle>Grade upgrade rate</CardTitle>
          </CardHeader>
          <CardContent>
            {upgrade.total > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={upgradePie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {upgradePie.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  <p className="text-4xl font-semibold tracking-tight text-foreground">
                    {Math.round(upgrade.rate * 100)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {upgrade.upgraded} of {upgrade.total} reviewed assessments upgraded
                  </p>
                  <div className="space-y-1 pt-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SUCCESS }} />
                      <span className="text-muted-foreground">Upgraded — {upgrade.upgraded}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: MUTED }} />
                      <span className="text-muted-foreground">Not upgraded — {upgrade.notUpgraded}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyChart message="No reviewed assessments in this period" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
