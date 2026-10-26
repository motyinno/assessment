"use client";

import { useEffect, useState } from "react";

/**
 * "Often asked at client interviews" marks for the matrix and roadmap, from
 * the division's interview question bank (lib/question-bank.ts).
 */

export interface InterviewStats {
  topics: Record<string, { questions: number; asked: number }>;
  skills: Record<string, Record<string, number>>;
  oftenAsked: number;
}

const EMPTY: InterviewStats = { topics: {}, skills: {}, oftenAsked: 3 };

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

/** Times a skill was asked, when it reaches the "often asked" threshold. */
export function skillAsked(stats: InterviewStats, topicId: string, skill: string): number | null {
  const n = stats.skills[topicId]?.[skill] ?? 0;
  return n >= stats.oftenAsked ? n : null;
}

/** Small "asked N×" mark next to a skill. */
export function OftenAskedMark({ count }: { count: number | null }) {
  if (!count) return null;
  return (
    <span
      className="ml-1 inline-flex shrink-0 items-center rounded-full bg-orange-500/15 px-1.5 text-[10px] font-medium leading-4 text-orange-700 dark:text-orange-300"
      title={`Asked ${count} times at client interviews`}
    >
      asked {count}×
    </span>
  );
}

/** "N interview questions" under a topic title. */
export function TopicAskedBadge({ stats, topicId }: { stats: InterviewStats; topicId: string }) {
  const t = stats.topics[topicId];
  if (!t) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 text-[10px] font-medium leading-5 text-orange-700 dark:text-orange-300">
      {t.questions} interview question{t.questions === 1 ? "" : "s"}
    </span>
  );
}
