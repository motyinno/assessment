import { cn } from "@/lib/utils";

/**
 * The logo mark: a peak shaped like an "A", a switchback trail up its face
 * and a flag on the summit. Drawn in currentColor; the trail and flag colors
 * can be overridden with --mark-trail / --mark-flag.
 *
 * `animated` plays the intro once (keyframes in globals.css). Remount the
 * component (change its `key`) to replay it.
 */
export function ClimbMark({
  className,
  animated = false,
  wave = false,
}: {
  className?: string;
  animated?: boolean;
  /** Keep the flag waving without replaying the intro. */
  wave?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={cn("climb-mark overflow-visible", animated && "climb-play", wave && "climb-wave", className)}
    >
      <path
        className="am-ridge"
        pathLength={100}
        d="M4 41 L24 12 L44 41"
        stroke="currentColor"
        strokeWidth={3.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="am-trail"
        pathLength={100}
        d="M15 41 L29 36 L20 30 L27 24 L24 18"
        style={{ stroke: "var(--mark-trail, currentColor)" }}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line className="am-pole" x1={24} y1={12} x2={24} y2={3} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path className="am-flag" d="M24 3 L33 5.5 L24 8 Z" style={{ fill: "var(--mark-flag, currentColor)" }} />
    </svg>
  );
}

/** Red app tile with the white mark — sidebar, login, favicon look. */
export function ClimbTile({
  className,
  markClassName,
  animated,
}: {
  className?: string;
  markClassName?: string;
  animated?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm ring-1 ring-primary/20",
        className
      )}
      style={{ ["--mark-trail" as string]: "oklch(1 0 0 / 0.6)" }}
    >
      <ClimbMark animated={animated} className={cn("size-[62%]", markClassName)} />
    </div>
  );
}
