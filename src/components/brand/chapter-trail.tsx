"use client";

import { useEffect, useRef, useState } from "react";
import { HIGH_CAMP, legPosition } from "@/lib/climb-chapters";
import { cn } from "@/lib/utils";

const TRAIL_POINTS: Array<[number, number]> = [
  [70, 236], [330, 222], [150, 186], [450, 160], [230, 120], [520, 98], [360, 62], [560, 34],
];

/** Catmull-Rom through the points, so the switchbacks turn in soft hairpins. */
function smoothPath(pts: Array<[number, number]>): string {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return d;
}
const TRAIL_D = smoothPath(TRAIL_POINTS);

/** A slice of the trail as a polyline, sampled from the rendered path. */
function slice(path: SVGPathElement, from: number, to: number, steps = 60): string {
  const total = path.getTotalLength();
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const p = path.getPointAtLength((from + ((to - from) * i) / steps) * total);
    return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  return "M" + pts.join(" L");
}

/**
 * One leg of the climb, from the current camp to the next. The climber's
 * height is roadmap readiness: it walks up to the high camp, reached at the
 * ready threshold, and stops there — the last stretch to the next camp is the
 * assessment and is never walked here. Plan goals are waypoints along the
 * way: they mark the route and light up when done, but don't move the
 * climber, so a new plan adds points ahead instead of pulling anyone down.
 * Clicking replays the walk.
 */
export function ChapterTrail({
  fromLabel,
  toLabel,
  waypoints,
  readiness,
}: {
  fromLabel: string;
  toLabel: string;
  /** One entry per plan goal: is it finished, and has a self-check on it passed? */
  waypoints: Array<{ id: string; done: boolean; checked?: boolean }>;
  /** 0–100, roadmap readiness for the next grade. */
  readiness: number;
}) {
  const trailRef = useRef<SVGPathElement>(null);
  const [marks, setMarks] = useState<Array<{ x: number; y: number }>>([]);
  const [camp, setCamp] = useState<{ x: number; y: number } | null>(null);
  const [route, setRoute] = useState<{ approach: string; summit: string } | null>(null);
  const [climber, setClimber] = useState({ x: TRAIL_POINTS[0][0], y: TRAIL_POINTS[0][1] });
  const [walked, setWalked] = useState(0);
  const [run, setRun] = useState(0);
  const count = waypoints.length;
  const target = legPosition(readiness);
  const atCamp = target >= HIGH_CAMP;

  useEffect(() => {
    const path = trailRef.current;
    if (!path) return;
    const total = path.getTotalLength();
    // Waypoints sit evenly between the current camp and the high camp.
    setMarks(
      Array.from({ length: count }, (_, i) => {
        const p = path.getPointAtLength(((i + 1) / (count + 1)) * HIGH_CAMP * total);
        return { x: p.x, y: p.y };
      })
    );
    const c = path.getPointAtLength(HIGH_CAMP * total);
    setCamp({ x: c.x, y: c.y });
    setRoute({ approach: slice(path, 0, HIGH_CAMP), summit: slice(path, HIGH_CAMP, 1, 20) });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 700 + target * 1700;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = duration ? Math.min(1, (now - start) / duration) : 1;
      const f = target * (1 - Math.pow(1 - k, 3));
      const p = path.getPointAtLength(f * total);
      setClimber({ x: p.x, y: p.y });
      setWalked(f);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [count, target, run]);

  const [sx, sy] = TRAIL_POINTS[0];
  const [ex, ey] = TRAIL_POINTS[TRAIL_POINTS.length - 1];

  return (
    <svg
      viewBox="0 0 640 260"
      className="w-full cursor-pointer overflow-visible"
      onClick={() => setRun((n) => n + 1)}
      role="img"
      aria-label={`Leg from ${fromLabel} to ${toLabel}: ${readiness}% ready, the summit is taken at an assessment`}
    >
      <title>Click to replay the walk</title>
      <path d="M0 150 L70 88 L150 122 L235 58 L300 70 Z" className="fill-muted" />
      <path d="M0 260 L0 150 L300 70 L560 20 L640 58 L640 260 Z" className="fill-muted/40" />
      <path d="M0 150 L300 70 L560 20 L640 58" fill="none" className="stroke-border" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M522 30 L560 20 L602 40 L586 37 L566 47 L546 37 Z" className="fill-muted-foreground/15" />

      {/* measuring path only; what's drawn is the approach and the summit push */}
      <path ref={trailRef} d={TRAIL_D} fill="none" stroke="none" />
      {route && (
        <>
          {/* the approach: a quiet trail bed up to the high camp */}
          <path d={route.approach} fill="none" className="stroke-muted-foreground/20" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
          {/* the summit push: dotted, taken only at an assessment */}
          <path d={route.summit} fill="none" className="stroke-muted-foreground/45" strokeWidth={2.5} strokeDasharray="0.1 7" strokeLinecap="round" />
        </>
      )}
      {/* walked so far */}
      <path
        d={TRAIL_D}
        fill="none"
        pathLength={1}
        className="stroke-trail"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${walked} 2`}
        opacity={walked > 0 ? 1 : 0}
      />

      {/* current camp */}
      <g>
        <circle cx={sx} cy={sy} r={8} className="fill-trail" />
        <text x={sx} y={sy - 16} textAnchor="middle" className="fill-foreground font-mono text-[13px]">{fromLabel}</text>
      </g>

      {/* high camp: as far as readiness goes */}
      {camp && (
        <g>
          <title>{atCamp ? "High camp reached: ready for an assessment" : "High camp: 70% ready"}</title>
          <path
            d={`M${camp.x - 10} ${camp.y + 6} L${camp.x} ${camp.y - 9} L${camp.x + 10} ${camp.y + 6} Z`}
            className={cn(atCamp ? "fill-trail stroke-trail" : "fill-card stroke-muted-foreground/60")}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* next camp */}
      <g>
        <line x1={ex} y1={ey} x2={ex} y2={ey - 30} className="stroke-foreground" strokeWidth={2} strokeLinecap="round" />
        <g className="climb-mark climb-wave">
          <path className="am-flag fill-muted-foreground/40" d={`M${ex} ${ey - 30} L${ex + 22} ${ey - 23.5} L${ex} ${ey - 17} Z`} />
        </g>
        <circle cx={ex} cy={ey} r={8} className="fill-card stroke-primary" strokeWidth={2.5} />
        <text x={ex - 16} y={ey + 5} textAnchor="end" className="fill-foreground font-mono text-[13px] font-semibold">{toLabel}</text>
      </g>

      {marks.map((m, i) => {
        const done = waypoints[i]?.done;
        const checked = waypoints[i]?.checked;
        return (
          <g key={waypoints[i]?.id ?? i}>
            {checked && (
              <g>
                <title>Self-check passed</title>
                <circle cx={m.x} cy={m.y} r={15} fill="none" className="stroke-success" strokeWidth={2} />
                <circle cx={m.x + 10} cy={m.y - 10} r={5.5} className="fill-success stroke-card" strokeWidth={1.5} />
                <path d={`M${m.x + 7.6} ${m.y - 10} l1.7 1.8 l3.2 -3.4`} fill="none" className="stroke-white" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            <circle cx={m.x} cy={m.y} r={11} className={cn(done ? "fill-trail" : "fill-card stroke-muted-foreground/50")} strokeWidth={1.5} />
            <text x={m.x} y={m.y + 4} textAnchor="middle" className={cn("font-mono text-[11px] font-semibold", done ? "fill-white" : "fill-muted-foreground")}>
              {i + 1}
            </text>
          </g>
        );
      })}

      <circle cx={climber.x} cy={climber.y} r={8} className="fill-primary stroke-card" strokeWidth={3} />
    </svg>
  );
}
