import { z } from "zod";
import { topicReadiness } from "@/lib/climb-chapters";
import type { RoadmapDTO, RoadmapStatus } from "@/lib/roadmap-types";
import type { Grade } from "@/lib/types";

/**
 * Tech coach: the "mission of the week". Each week the coach proposes one
 * roadmap topic of the person's next grade to work on — chosen without AI, from
 * signals only this app has — then the AI writes a short study plan for it,
 * and a self-check closes it. A passed check marks the mission done and offers
 * to tick the skills on the roadmap.
 * Client-safe: no prisma.
 */

/** Assessment score (0–10) below which a topic counts as a stumble. */
export const STRUGGLE_SCORE = 6;
/** Fewer assessed people than this and the struggle rate is just noise. */
export const STRUGGLE_MIN_SAMPLE = 3;
/** A topic worked on (done or dropped) this many days ago is not proposed again. */
export const MISSION_COOLDOWN_DAYS = 28;
/** Skills one mission focuses on. */
export const MISSION_SKILLS = 3;
/** Topics offered to choose from. */
export const MISSION_OPTIONS = 3;

const DAY = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the week `d` falls in, as "YYYY-MM-DD". */
export function weekStartOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/** Why the coach picked a topic, in the order shown. */
export type MissionReason =
  | { kind: "gap"; resolved: number; total: number }
  | { kind: "struggle"; weak: number; assessed: number }
  | { kind: "pdp" }
  | { kind: "asked"; times: number };

export interface MissionOption {
  sectionId: string;
  section: string;
  topicId: string;
  topicTitle: string;
  band: Grade;
  status: RoadmapStatus;
  skills: string[];
  reasons: MissionReason[];
  score: number;
}

export interface CoachSignals {
  /** Division-wide assessment results at the band: people assessed and how many scored low, per topic. */
  struggle: Record<string, { assessed: number; weak: number }>;
  /** Matrix topics of the person's active PDP goals. */
  pdpTopicIds: Set<string>;
  /** How often clients ask, per topic and per skill (question bank). */
  asked: { topics: Record<string, { asked: number }>; skills: Record<string, Record<string, number>> };
  /** Topics worked on recently — not proposed again for a while. */
  recentTopicIds: Set<string>;
}

const WEIGHTS = { gap: 1, struggle: 1.2, pdp: 0.8, asked: 0.4 };

/**
 * Rank the topics of `band` the person hasn't mastered. A topic scores for
 * its gap on their roadmap, for how often people of their division stumble on
 * it at assessments for that grade, for being a goal of their PDP, and (a bit)
 * for client demand. Recently worked topics drop out unless nothing else is left.
 */
export function rankMissionTopics(roadmap: RoadmapDTO, band: Grade, signals: CoachSignals): MissionOption[] {
  const maxAsked = Math.max(1, ...Object.values(signals.asked.topics).map((t) => t.asked));
  const all: MissionOption[] = [];
  for (const section of roadmap.sections) {
    for (const topic of section.topics) {
      const skillsAtBand = topic.skills[band];
      if (!skillsAtBand.length) continue;
      const status = topic.status[band];
      if (status === "mastered") continue;
      const resolved = new Set(topic.resolvedSkills[band]);
      const open = skillsAtBand.filter((s) => !resolved.has(s));
      if (!open.length) continue;

      const reasons: MissionReason[] = [];
      const gap = 1 - topicReadiness(status, resolved.size, skillsAtBand.length);
      if (gap > 0) reasons.push({ kind: "gap", resolved: resolved.size, total: skillsAtBand.length });

      const st = signals.struggle[topic.id];
      const struggleRate = st && st.assessed >= STRUGGLE_MIN_SAMPLE ? st.weak / st.assessed : 0;
      if (struggleRate >= 0.25) reasons.push({ kind: "struggle", weak: st!.weak, assessed: st!.assessed });

      const inPdp = signals.pdpTopicIds.has(topic.id);
      if (inPdp) reasons.push({ kind: "pdp" });

      const asked = signals.asked.topics[topic.id]?.asked ?? 0;
      if (asked >= 3) reasons.push({ kind: "asked", times: asked });

      // Skills clients ask about most come first, then matrix order.
      const askedBySkill = signals.asked.skills[topic.id] ?? {};
      const skills = open
        .map((s, i) => ({ s, i, n: askedBySkill[s] ?? 0 }))
        .sort((a, b) => b.n - a.n || a.i - b.i)
        .slice(0, MISSION_SKILLS)
        .map((x) => x.s);

      all.push({
        sectionId: section.id,
        section: section.title,
        topicId: topic.id,
        topicTitle: topic.title,
        band,
        status,
        skills,
        reasons,
        score:
          gap * WEIGHTS.gap +
          struggleRate * WEIGHTS.struggle +
          (inPdp ? WEIGHTS.pdp : 0) +
          (asked / maxAsked) * WEIGHTS.asked,
      });
    }
  }
  const byScore = (a: MissionOption, b: MissionOption) => b.score - a.score || a.topicTitle.localeCompare(b.topicTitle);
  const fresh = all.filter((o) => !signals.recentTopicIds.has(o.topicId)).sort(byScore);
  return fresh.length ? fresh : all.sort(byScore);
}

/** Topics on cooldown: missions done or dropped within MISSION_COOLDOWN_DAYS, plus any still active. */
export function recentTopics(
  missions: Array<{ topicId: string; status: string; createdAt: Date }>,
  now: Date
): Set<string> {
  const since = now.getTime() - MISSION_COOLDOWN_DAYS * DAY;
  return new Set(missions.filter((m) => m.status === "ACTIVE" || m.createdAt.getTime() >= since).map((m) => m.topicId));
}

/**
 * Weeks in a row, up to now, with at least one finished mission. The current
 * week doesn't break the streak while it's still open.
 */
export function missionStreak(completedAt: Date[], now: Date): number {
  const weeks = new Set(completedAt.map(weekStartOf));
  let cursor = new Date(`${weekStartOf(now)}T00:00:00Z`);
  if (!weeks.has(weekStartOf(cursor))) cursor = new Date(cursor.getTime() - 7 * DAY);
  let streak = 0;
  while (weeks.has(weekStartOf(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 7 * DAY);
  }
  return streak;
}

// ── The AI study plan ────────────────────────────────────────────────────────

export interface MissionStep {
  kind: "learn" | "practice";
  title: string;
  detail: string;
  minutes: number;
}

export interface MissionPlan {
  /** Why this matters at the next grade, 2–3 sentences. */
  summary: string;
  steps: MissionStep[];
  /** One hands-on task to finish the week with. */
  task: { title: string; description: string; doneWhen: string[] };
  resources: Array<{ label: string; url: string }>;
}

const planSchema = z.object({
  summary: z.string().trim().min(1),
  steps: z
    .array(
      z.object({
        kind: z.enum(["learn", "practice"]).catch("learn"),
        title: z.string().trim().min(1),
        detail: z.string().trim().default(""),
        minutes: z.coerce.number().int().min(5).max(240).catch(30),
      })
    )
    .min(1)
    .max(8),
  task: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1),
    doneWhen: z.array(z.string().trim().min(1)).default([]),
  }),
  resources: z
    .array(z.object({ label: z.string().trim().min(1), url: z.string().trim() }))
    .default([]),
});

/** Validate the AI's plan; resources keep only plain https links. */
export function parseMissionPlan(raw: unknown): MissionPlan {
  const parsed = planSchema.safeParse((raw as { plan?: unknown })?.plan ?? raw);
  if (!parsed.success) throw new Error("The AI returned an unusable plan");
  const plan = parsed.data;
  return {
    ...plan,
    resources: plan.resources
      .filter((r) => {
        try {
          return new URL(r.url).protocol === "https:";
        } catch {
          return false;
        }
      })
      .slice(0, 5),
  };
}

/** What the mission card gets. */
export interface MissionView {
  id: string;
  topicId: string;
  topicTitle: string;
  band: Grade;
  skills: string[];
  reasons: MissionReason[];
  language: string;
  plan: MissionPlan;
  status: "ACTIVE" | "DONE" | "DROPPED";
  createdAt: string;
  completedAt: string | null;
  /** Latest submitted self-check score, if any. */
  checkScore: number | null;
}

/** A finished or dropped mission, for the history list. */
export interface PastMission extends MissionView {
  /** While the topic is on cooldown: the day the coach may offer it again. */
  offeredAgainFrom: string | null;
}

/** When a mission's topic comes back into rotation, or null if it already has. */
export function offeredAgainFrom(createdAt: Date, now: Date): string | null {
  const at = createdAt.getTime() + MISSION_COOLDOWN_DAYS * DAY;
  return at > now.getTime() ? new Date(at).toISOString() : null;
}

export interface CoachState {
  /** No grade, or at the top of the matrix: nothing to coach toward. */
  available: boolean;
  targetGradeLabel: string | null;
  /** The mission being worked on, or the one finished this week. */
  mission: MissionView | null;
  /** Topics to start a mission on, when there is no active one. */
  options: MissionOption[];
  streak: number;
  done: number;
  /** Every mission but the active one, newest first. */
  history: PastMission[];
}
