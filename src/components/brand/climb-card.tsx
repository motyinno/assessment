"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GRADE_VALUES, gradeLabel, gradeRank, nextGrade } from "@/lib/grades";
import { cn } from "@/lib/utils";

// Grades are camps on the mountain; each step up is 520 m of altitude,
// from Trainee at base camp (400 m) to Senior+ on the summit (5 600 m).
const BASE_ALTITUDE = 400;
const STEP_ALTITUDE = 520;
const altitudeOf = (rank: number) => BASE_ALTITUDE + Math.max(rank, 0) * STEP_ALTITUDE;

const TRAIL_POINTS: Array<[number, number]> = [
  [250, 212], [420, 196], [330, 170], [470, 140], [380, 118],
  [470, 92], [410, 70], [450, 50], [430, 22],
];
const TRAIL_D = "M" + TRAIL_POINTS.map(([x, y]) => `${x} ${y}`).join(" L");
// Camps that get a text label; the rest are plain markers.
const LABELLED = new Set(["Trainee", "jun", "mid", "sen"]);
const LAST = GRADE_VALUES.length - 1;

const fmt = (n: number) => n.toLocaleString("ru-RU");

export function ClimbCard({
  grade,
  readiness,
}: {
  grade: string | null;
  /** Roadmap readiness (0–100) for the next grade, or null without one. */
  readiness: number | null;
}) {
  const rank = gradeRank(grade);
  const known = rank >= 0;
  const target = known ? rank / LAST : 0;
  const next = nextGrade(grade);

  const trailRef = useRef<SVGPathElement>(null);
  const [camps, setCamps] = useState<Array<{ x: number; y: number }>>([]);
  const [climber, setClimber] = useState({ x: TRAIL_POINTS[0][0], y: TRAIL_POINTS[0][1] });
  const [walked, setWalked] = useState(0); // fraction of the trail drawn behind the climber
  const [altitude, setAltitude] = useState(BASE_ALTITUDE);
  const [run, setRun] = useState(0); // bumped by clicking the mountain to replay the climb

  useEffect(() => {
    const path = trailRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    setCamps(
      GRADE_VALUES.map((_, i) => {
        const p = path.getPointAtLength((i / LAST) * total);
        return { x: p.x, y: p.y };
      })
    );

    const finalAlt = altitudeOf(rank);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 900 + target * 1400;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - start) / duration) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      const f = target * e;
      const p = path.getPointAtLength(f * total);
      setClimber({ x: p.x, y: p.y });
      setWalked(f);
      setAltitude(Math.round((BASE_ALTITUDE + (finalAlt - BASE_ALTITUDE) * e) / 10) * 10);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [rank, target, run]);

  const atSummit = rank === LAST;
  const nextCamp = next ? camps[gradeRank(next)] : undefined;

  return (
    <section className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* sky */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(80% 90% at 85% 0%, color-mix(in oklch, var(--trail) 22%, transparent) 0%, transparent 60%), radial-gradient(60% 70% at 100% 100%, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 70%)",
        }}
      />
      <div className="relative grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-end lg:p-8">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your climb</p>
            {known ? (
              <>
                <p className="font-display text-4xl font-extrabold tracking-[-0.03em] text-foreground">
                  {gradeLabel(grade)}
                </p>
                <p className="font-mono text-sm tabular-nums text-muted-foreground">
                  Altitude <span className="text-foreground">{fmt(altitude)} m</span>
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-3xl font-extrabold tracking-[-0.03em] text-foreground">Base camp</p>
                <p className="text-sm text-muted-foreground">Your grade isn&apos;t set yet. An assessment sets your first camp.</p>
              </>
            )}
          </div>

          {atSummit ? (
            <p className="text-sm text-muted-foreground">You&apos;re on the summit. Time to help others climb.</p>
          ) : next && known ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Next camp <span className="font-medium text-foreground">{gradeLabel(next)}</span>
                <span className="font-mono tabular-nums"> · +{fmt(STEP_ALTITUDE)} m</span>
              </p>
              {readiness !== null ? (
                <Link href="/climb" className="group block space-y-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-trail transition-[width] duration-1000 ease-out"
                      style={{ width: `${readiness}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground group-hover:text-foreground">
                    Ready for {gradeLabel(next)}: {readiness}% →
                  </p>
                </Link>
              ) : (
                <Link href="/climb" className="text-xs font-medium text-primary hover:underline">
                  See this leg →
                </Link>
              )}
            </div>
          ) : (
            <Link href="/request-assessment" className="text-sm font-medium text-primary hover:underline">
              Request an assessment →
            </Link>
          )}
        </div>

        <svg
          viewBox="150 -24 500 244"
          className="w-full cursor-pointer overflow-visible"
          onClick={() => setRun((n) => n + 1)}
          role="img"
          aria-label={`Mountain with grade camps; you are at ${gradeLabel(grade)}`}
        >
          <title>Click to replay the climb</title>
          {/* back ridges */}
          <path d="M0 220 L90 140 L170 185 L250 110 L330 160 L360 140 L360 220 Z" className="fill-muted" />
          <path d="M500 220 L560 120 L640 170 L640 220 Z" className="fill-muted" />
          {/* main peak */}
          <path d="M150 220 L430 18 L640 160 L640 220 Z" className="fill-background stroke-border" strokeWidth={1.5} />
          <path d="M392 46 L430 18 L470 45 L452 40 L432 52 L414 40 Z" className="fill-muted-foreground/15" />

          <path ref={trailRef} d={TRAIL_D} fill="none" className="stroke-muted-foreground/30" strokeWidth={2} strokeDasharray="4 6" strokeLinecap="round" />
          <path
            d={TRAIL_D}
            fill="none"
            pathLength={1}
            className="stroke-trail"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            strokeDashoffset={1 - walked}
          />

          {camps.map((c, i) => {
            const g = GRADE_VALUES[i];
            const reached = known && i <= rank;
            return (
              <g key={g}>
                <circle cx={c.x} cy={c.y} r={LABELLED.has(g) ? 5 : 3.5} className={cn(reached ? "fill-trail" : "fill-card stroke-muted-foreground/40")} strokeWidth={1.5} />
                {LABELLED.has(g) && (
                  <text x={c.x - 12} y={c.y + 4} textAnchor="end" className={cn("font-mono text-[12px]", reached ? "fill-foreground" : "fill-muted-foreground")}>
                    {gradeLabel(g)}
                  </text>
                )}
              </g>
            );
          })}

          {nextCamp && <circle cx={nextCamp.x} cy={nextCamp.y} r={6} fill="none" className="climb-ping stroke-trail" strokeWidth={2} />}

          {/* summit flag */}
          <line x1={430} y1={18} x2={430} y2={-14} className="stroke-foreground" strokeWidth={2} strokeLinecap="round" />
          <g className="climb-mark climb-wave">
            <path className={cn("am-flag", atSummit ? "fill-primary" : "fill-muted-foreground/40")} d="M430 -14 L452 -7.5 L430 -1 Z" />
          </g>

          <circle cx={climber.x} cy={climber.y} r={8} className="fill-primary stroke-card" strokeWidth={3} />
        </svg>
      </div>
    </section>
  );
}
