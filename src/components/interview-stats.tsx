"use client";

import { useEffect, useState } from "react";

/**
 * "Often asked at client interviews" highlighting for the matrix and roadmap,
 * from the division's interview question bank (lib/question-bank.ts). A
 * skill is tinted by how often clients ask about it — warm from 3 asks, hot
 * from 10 — with the exact count in the tooltip.
 */

export interface InterviewStats {
  topics: Record<string, { questions: number; asked: number }>;
  skills: Record<string, Record<string, number>>;
  oftenAsked: number;
}

const EMPTY: InterviewStats = { topics: {}, skills: {}, oftenAsked: 3 };

/** From this many asks a skill is "hot" (the "warm" floor is `oftenAsked`). */
export const HOT_ASKED = 10;

export type Heat = "hot" | "warm" | null;

/** `divisionId` null/undefined = the caller's own division. */
export function useInterviewStats(divisionId?: string | null, refreshKey?: unknown): InterviewStats {
  const [stats, setStats] = useState<InterviewStats>(EMPTY);
  useEffect(() => {
    const controller = new AbortController();
    const qs = divisionId ? `?departmentId=${encodeURIComponent(divisionId)}` : "";
    fetch(`/api/tech-matrix/interview-stats${qs}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: InterviewStats | null) => d && setStats(d))
      .catch(() => {});
    return () => controller.abort();
  }, [divisionId, refreshKey]);
  return stats;
}

export function skillCount(stats: InterviewStats, topicId: string, skill: string): number {
  return stats.skills[topicId]?.[skill] ?? 0;
}

export function heatOf(count: number, floor = 3): Heat {
  if (count >= HOT_ASKED) return "hot";
  if (count >= floor) return "warm";
  return null;
}

/** Background/text classes for a tinted skill. */
export const HEAT_CLASS: Record<Exclude<Heat, null>, string> = {
  hot: "bg-orange-500/20 text-orange-900 ring-1 ring-inset ring-orange-500/40 dark:text-orange-100",
  warm: "bg-amber-400/15 text-amber-900 ring-1 ring-inset ring-amber-400/30 dark:text-amber-100",
};

/** Dot colour that replaces the band dot on a tinted skill. */
export const HEAT_DOT: Record<Exclude<Heat, null>, string> = {
  hot: "bg-orange-500",
  warm: "bg-amber-400",
};

export function heatTitle(count: number): string | undefined {
  return count > 0 ? `Asked ${count} time${count === 1 ? "" : "s"} at client interviews` : undefined;
}

/** Stable sort: most-asked first, untouched order otherwise. */
export function byAsked<T>(items: T[], count: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, n: count(item) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.item);
}

/** "N interview questions" under a topic title. */
export function TopicAskedBadge({ stats, topicId }: { stats: InterviewStats; topicId: string }) {
  const t = stats.topics[topicId];
  if (!t) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-orange-500/10 px-2 text-[10px] font-medium leading-5 text-orange-700 dark:text-orange-300"
      title={`${t.questions} questions, asked ${t.asked} times in total`}
    >
      {t.questions} interview question{t.questions === 1 ? "" : "s"}
    </span>
  );
}

/** Legend for the tint, with the threshold numbers. */
export function HeatLegend({ floor = 3 }: { floor?: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Asked at client interviews:</span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-3 w-5 rounded-sm ${HEAT_CLASS.hot}`} />
        {HOT_ASKED}+ times
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-3 w-5 rounded-sm ${HEAT_CLASS.warm}`} />
        {floor}–{HOT_ASKED - 1} times
      </span>
    </span>
  );
}
