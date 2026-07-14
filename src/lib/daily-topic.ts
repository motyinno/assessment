import { Prisma } from "@prisma/client";
import prisma from "./prisma";
import {
  generateDailyTopic,
  type DailyTopicResource,
} from "./ai-service";

export interface DailyTopic {
  date: string;
  kind: "concept" | "problem";
  title: string;
  category: string;
  summary: string;
  detail: string;
  code: string | null;
  resources: DailyTopicResource[];
}

/** Server-local calendar date as "YYYY-MM-DD" (en-CA renders ISO-style). */
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function toDailyTopic(row: {
  date: string;
  kind: string;
  title: string;
  category: string;
  summary: string;
  detail: string;
  code: string | null;
  resources: unknown;
}): DailyTopic {
  return {
    date: row.date,
    kind: row.kind === "problem" ? "problem" : "concept",
    title: row.title,
    category: row.category,
    summary: row.summary,
    detail: row.detail,
    code: row.code,
    resources: Array.isArray(row.resources)
      ? (row.resources as DailyTopicResource[])
      : [],
  };
}

/** Titles of the last ~10 topics, to steer generation away from repeats. */
async function recentTitles(): Promise<string[]> {
  const rows = await prisma.dailyTopic.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

/**
 * Return today's dashboard topic, generating and caching it on first view of
 * the day. Deterministic per day (one shared row), alternating concept/problem
 * for variety. Returns null if generation fails, so the dashboard can simply
 * omit the card instead of erroring.
 */
export async function getTopicOfTheDay(): Promise<DailyTopic | null> {
  const date = todayKey();

  const existing = await prisma.dailyTopic.findUnique({ where: { date } });
  if (existing) return toDailyTopic(existing);

  // Alternate concept/problem by day for a mix.
  const day = Number(date.slice(-2)) || 0;
  const kind: "concept" | "problem" = day % 2 === 0 ? "concept" : "problem";

  try {
    const generated = await generateDailyTopic(kind, await recentTitles());
    const created = await prisma.dailyTopic.create({
      data: {
        date,
        kind: generated.kind,
        title: generated.title,
        category: generated.category,
        summary: generated.summary,
        detail: generated.detail,
        code: generated.code,
        resources: generated.resources as unknown as Prisma.InputJsonValue,
      },
    });
    return toDailyTopic(created);
  } catch (e) {
    // Another concurrent request may have created it first (unique date).
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      const row = await prisma.dailyTopic.findUnique({ where: { date } });
      return row ? toDailyTopic(row) : null;
    }
    console.error("getTopicOfTheDay failed:", e);
    return null;
  }
}

/**
 * Force a fresh topic for today, overwriting the cached row. Used by the admin
 * "Another topic" button. Picks the kind at random (for variety) and steers
 * away from recent titles — including the current one. Returns null on failure.
 */
export async function regenerateTopicForToday(): Promise<DailyTopic | null> {
  const date = todayKey();
  const kind: "concept" | "problem" =
    Math.random() < 0.5 ? "concept" : "problem";

  try {
    const generated = await generateDailyTopic(kind, await recentTitles());
    const row = await prisma.dailyTopic.upsert({
      where: { date },
      update: {
        kind: generated.kind,
        title: generated.title,
        category: generated.category,
        summary: generated.summary,
        detail: generated.detail,
        code: generated.code,
        resources: generated.resources as unknown as Prisma.InputJsonValue,
      },
      create: {
        date,
        kind: generated.kind,
        title: generated.title,
        category: generated.category,
        summary: generated.summary,
        detail: generated.detail,
        code: generated.code,
        resources: generated.resources as unknown as Prisma.InputJsonValue,
      },
    });
    return toDailyTopic(row);
  } catch (e) {
    console.error("regenerateTopicForToday failed:", e);
    return null;
  }
}
