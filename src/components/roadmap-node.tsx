"use client";

import type { Grade } from "@/lib/types";
import { STATUS_META, type RoadmapTopicDTO } from "@/lib/roadmap-types";
import type { SectionColor } from "@/lib/section-colors";
import { cn } from "@/lib/utils";

/**
 * A single topic on the roadmap: a clickable card showing the topic title and
 * its status at the focal grade. Purely presentational — the parent section
 * positions it beside the spine.
 */
export function RoadmapNode({
  topic,
  color,
  align,
  focalGrade,
  onClick,
}: {
  topic: RoadmapTopicDTO;
  color: SectionColor;
  align: "left" | "right";
  focalGrade: Grade;
  onClick: () => void;
}) {
  const meta = STATUS_META[topic.status[focalGrade]];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group w-full rounded-lg border border-l-4 bg-card px-3 py-2 text-left shadow-sm transition-all hover:shadow-md hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        color.border,
        align === "left" ? "text-right" : "text-left"
      )}
    >
      <span className="block text-[13px] font-medium leading-snug text-foreground">
        {topic.title}
      </span>
      <span
        className={cn(
          "mt-1.5 flex",
          align === "left" ? "justify-end" : "justify-start"
        )}
      >
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            meta.badge
          )}
        >
          {meta.label}
        </span>
      </span>
    </button>
  );
}
