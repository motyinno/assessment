import { cn } from "@/lib/utils";

const TRAIL = "M15 41 L29 36 L20 30 L27 24 L24 18";

/**
 * Brand loader: a dot climbing the switchbacks of the logo mark.
 * Replaces the generic spinner for long waits (AI generation).
 */
export function ClimbLoader({
  label,
  className,
  size = "md",
}: {
  label?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "size-4", md: "size-6", lg: "size-12" }[size];
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={cn(box, "shrink-0 overflow-visible")}>
        <path d="M4 41 L24 12 L44 41" stroke="currentColor" strokeOpacity={0.3} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        <path d={TRAIL} stroke="currentColor" strokeOpacity={0.2} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <circle r={size === "sm" ? 4.5 : 3.4} className="fill-trail">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={TRAIL} />
        </circle>
        <path d="M24 3 L33 5.5 L24 8 Z" className="fill-primary">
          <animate attributeName="opacity" values="0.15;0.15;1;0.15" keyTimes="0;0.85;0.95;1" dur="1.8s" repeatCount="indefinite" />
        </path>
      </svg>
      {label && <span>{label}</span>}
    </span>
  );
}
