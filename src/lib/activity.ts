/**
 * App usage for the super-admin Activity page. Sign-ins come from the auth
 * events, page views from a beacon in the app layout. Client-safe helpers.
 */

export const ACTIVITY_WINDOW_DAYS = 30;
export const ACTIVITY_RETENTION_DAYS = 180;

const ID_SEGMENT = /^(c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+|[A-Za-z0-9_-]{24,})$/;

/**
 * A page path for counting: no query or hash, record ids collapsed to ":id"
 * so /users/abc… and /users/def… count as one page. Null for anything that
 * isn't an app path.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const path = raw.split(/[?#]/)[0];
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((s) => (ID_SEGMENT.test(s) ? ":id" : s.toLowerCase()));
  const out = "/" + segments.join("/");
  return out.length > 200 ? out.slice(0, 200) : out;
}

/** UTC calendar day key, e.g. "2026-11-10". */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export interface DayPoint {
  day: string;
  users: number;
  views: number;
}

/** One point per day for the last `days` days ending today, zeros where nothing happened. */
export function fillDays(rows: DayPoint[], today: Date, days = ACTIVITY_WINDOW_DAYS): DayPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1 - i)));
    const key = dayKey(d);
    return byDay.get(key) ?? { day: key, users: 0, views: 0 };
  });
}

export interface ActivityUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  divisionId: string | null;
  division: string | null;
  lastSeen: string | null;
  signIns: number;
  views: number;
}

/**
 * Every active user with their numbers for the window; people with no events
 * at all sort last, the most recently seen first.
 */
export function buildUserRows(
  users: Array<{ id: string; name: string; email: string; role: string; divisionId?: string | null }>,
  counts: Array<{ userId: string; kind: string; count: number }>,
  lastSeen: Array<{ userId: string; at: Date }>,
  divisionNames: Map<string, string> = new Map()
): ActivityUserRow[] {
  const seen = new Map(lastSeen.map((r) => [r.userId, r.at]));
  const rows = users.map((u) => {
    const mine = counts.filter((c) => c.userId === u.id);
    const divisionId = u.divisionId ?? null;
    return {
      ...u,
      divisionId,
      division: divisionId ? (divisionNames.get(divisionId) ?? null) : null,
      lastSeen: seen.get(u.id)?.toISOString() ?? null,
      signIns: mine.find((c) => c.kind === "sign_in")?.count ?? 0,
      views: mine.find((c) => c.kind === "view")?.count ?? 0,
    };
  });
  return rows.sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || a.name.localeCompare(b.name));
}

export interface DivisionActivity {
  /** null for people without a division. */
  id: string | null;
  name: string;
  total: number;
  /** Signed in or opened a page in the window. */
  active: number;
  signIns: number;
  views: number;
}

/** Per-division usage, biggest divisions first; people without one go last. */
export function byDivision(rows: ActivityUserRow[]): DivisionActivity[] {
  const groups = new Map<string | null, DivisionActivity>();
  for (const r of rows) {
    const g = groups.get(r.divisionId) ?? {
      id: r.divisionId,
      name: r.division ?? "No division",
      total: 0,
      active: 0,
      signIns: 0,
      views: 0,
    };
    g.total += 1;
    if (r.signIns + r.views > 0) g.active += 1;
    g.signIns += r.signIns;
    g.views += r.views;
    groups.set(r.divisionId, g);
  }
  return [...groups.values()].sort(
    (a, b) => Number(a.id === null) - Number(b.id === null) || b.total - a.total || a.name.localeCompare(b.name)
  );
}

export interface ActivityStats {
  generatedAt: string;
  /** The division the page is narrowed to, if any. */
  division: { id: string; name: string } | null;
  /** Always across everyone, so divisions can be compared. */
  divisions: DivisionActivity[];
  active: { today: number; week: number; month: number };
  signInsWeek: number;
  totalUsers: number;
  neverSeen: number;
  daily: DayPoint[];
  topPages: Array<{ path: string; views: number; users: number }>;
  byRole: Array<{ role: string; active: number; total: number }>;
  users: ActivityUserRow[];
  recentSignIns: Array<{ userId: string; name: string; at: string; provider: string | null }>;
}
