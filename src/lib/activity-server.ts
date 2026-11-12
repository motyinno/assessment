import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import {
  ACTIVITY_RETENTION_DAYS,
  ACTIVITY_WINDOW_DAYS,
  buildUserRows,
  byDivision,
  dayKey,
  fillDays,
  type ActivityStats,
} from "@/lib/activity";

const DAY = 24 * 60 * 60 * 1000;

/** Best effort: usage tracking must never break a sign-in or a page. */
export async function recordActivity(userId: string, kind: "sign_in" | "view", path: string | null) {
  try {
    await prisma.activityEvent.create({ data: { userId, kind, path } });
  } catch (e) {
    log.warn("activity: failed to record", { kind, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function recordSignIn(email: string | null | undefined, provider: string | null) {
  if (!email) return;
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (user) await recordActivity(user.id, "sign_in", provider);
  } catch (e) {
    log.warn("activity: failed to record sign-in", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Everything the Activity page shows. With `divisionId` the numbers cover
 * only that division's people; the per-division table always covers everyone.
 */
export async function loadActivityStats(divisionId: string | null = null, now = new Date()): Promise<ActivityStats> {
  await prisma.activityEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * DAY) } } });

  const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [allUsers, counts, lastSeen] = await Promise.all([
    prisma.user.findMany({
      where: { isArchived: false },
      select: { id: true, name: true, email: true, role: true, divisionId: true, division: { select: { name: true } } },
    }),
    prisma.activityEvent.groupBy({ by: ["userId", "kind"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.activityEvent.groupBy({ by: ["userId"], _max: { createdAt: true } }),
  ]);
  const divisionNames = new Map(
    allUsers.flatMap((u) => (u.divisionId && u.division ? [[u.divisionId, u.division.name] as const] : []))
  );
  const allRows = buildUserRows(
    allUsers,
    counts.map((c) => ({ userId: c.userId, kind: c.kind, count: c._count._all })),
    lastSeen.flatMap((r) => (r._max.createdAt ? [{ userId: r.userId, at: r._max.createdAt }] : [])),
    divisionNames
  );

  const division = divisionId && divisionNames.has(divisionId) ? { id: divisionId, name: divisionNames.get(divisionId)! } : null;
  const rows = division ? allRows.filter((r) => r.divisionId === division.id) : allRows;
  const ids = rows.map((r) => r.id);
  // Narrow events to the division's people; no filter at all otherwise.
  const who: Prisma.ActivityEventWhereInput = division ? { userId: { in: ids } } : {};
  const whoSql = division ? Prisma.sql`AND "userId" IN (${ids.length ? Prisma.join(ids) : Prisma.sql`NULL`})` : Prisma.empty;

  const distinctSince = async (from: Date) =>
    (await prisma.activityEvent.findMany({ where: { ...who, createdAt: { gte: from } }, distinct: ["userId"], select: { userId: true } })).length;

  const [today, week, month, signInsWeek, daily, topPages, recent] = await Promise.all([
    distinctSince(startOfToday),
    distinctSince(weekAgo),
    distinctSince(since),
    prisma.activityEvent.count({ where: { ...who, kind: "sign_in", createdAt: { gte: weekAgo } } }),
    prisma.$queryRaw<Array<{ day: Date; users: bigint; views: bigint }>>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(DISTINCT "userId") AS users,
             COUNT(*) FILTER (WHERE kind = 'view') AS views
      FROM "ActivityEvent" WHERE "createdAt" >= ${since} ${whoSql}
      GROUP BY 1`,
    prisma.$queryRaw<Array<{ path: string; views: bigint; users: bigint }>>`
      SELECT path, COUNT(*) AS views, COUNT(DISTINCT "userId") AS users
      FROM "ActivityEvent" WHERE kind = 'view' AND path IS NOT NULL AND "createdAt" >= ${since} ${whoSql}
      GROUP BY path ORDER BY views DESC LIMIT 12`,
    prisma.activityEvent.findMany({
      where: { ...who, kind: "sign_in" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { userId: true, path: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);

  const roles = ["USER", "ASSESSOR", "MANAGER", "ADMIN"];
  const isActive = (r: (typeof rows)[number]) => r.signIns + r.views > 0;

  return {
    generatedAt: now.toISOString(),
    division,
    divisions: byDivision(allRows),
    active: { today, week, month },
    signInsWeek,
    totalUsers: rows.length,
    neverSeen: rows.filter((r) => !r.lastSeen).length,
    daily: fillDays(
      daily.map((d) => ({ day: dayKey(new Date(d.day)), users: Number(d.users), views: Number(d.views) })),
      now
    ),
    topPages: topPages.map((p) => ({ path: p.path, views: Number(p.views), users: Number(p.users) })),
    byRole: roles.map((role) => ({
      role,
      total: rows.filter((r) => r.role === role).length,
      active: rows.filter((r) => r.role === role && isActive(r)).length,
    })),
    users: rows,
    recentSignIns: recent.map((r) => ({ userId: r.userId, name: r.user.name, at: r.createdAt.toISOString(), provider: r.path })),
  };
}
