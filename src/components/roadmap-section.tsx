"use client";

import type { Grade } from "@/lib/types";
import {
  STATUS_META,
  type RoadmapSectionDTO,
  type RoadmapTopicDTO,
} from "@/lib/roadmap-types";
import { sectionColor } from "@/lib/section-colors";
import { cn } from "@/lib/utils";
import { RoadmapNode } from "@/components/roadmap-node";
import { Check } from "lucide-react";

/**
 * One section rendered as a vertical "spine": topic nodes alternate left/right
 * of a central line, each connected to a status dot on the spine. The dot
 * reflects the topic's status at the focal grade band (the band the user is
 * working toward), so the spine reads as a progress path.
 */
export function RoadmapSection({
  section,
  focalGrade,
  onSelect,
}: {
  section: RoadmapSectionDTO;
  focalGrade: Grade;
  onSelect: (topic: RoadmapTopicDTO) => void;
}) {
  const color = sectionColor(section.id);
  const mastered = section.topics.filter(
    (t) => t.status[focalGrade] === "mastered"
  ).length;
  const total = section.topics.length;
  const pct = total ? Math.round((mastered / total) * 100) : 0;

  return (
    <div className={cn("rounded-xl border border-l-4 bg-card/40", color.border)}>
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-3">
        <h2 className="text-sm font-semibold">{section.title}</h2>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", color.bg, color.text)}>
          {mastered}/{total}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>

      {/* Spine */}
      <div className="relative px-3 pb-5 pt-1">
        {/* continuous vertical line */}
        <div className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-border" />
        <ul className="space-y-3">
          {section.topics.map((topic, i) => {
            const align = i % 2 === 0 ? "left" : "right";
            const status = topic.status[focalGrade];
            const meta = STATUS_META[status];
            const isMastered = status === "mastered";
            return (
              <li
                key={topic.id}
                className="grid items-center gap-0"
                style={{ gridTemplateColumns: "minmax(0,1fr) 44px minmax(0,1fr)" }}
              >
                {/* left cell */}
                <div className={cn(align === "left" ? "block" : "invisible")}>
                  {align === "left" && (
                    <RoadmapNode topic={topic} color={color} align="left" focalGrade={focalGrade} onClick={() => onSelect(topic)} />
                  )}
                </div>

                {/* spine dot */}
                <div className="relative flex h-full items-center justify-center">
                  <span
                    className={cn(
                      "z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 ring-4 ring-background transition-colors",
                      meta.dot
                    )}
                  >
                    {isMastered && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </div>

                {/* right cell */}
                <div className={cn(align === "right" ? "block" : "invisible")}>
                  {align === "right" && (
                    <RoadmapNode topic={topic} color={color} align="right" focalGrade={focalGrade} onClick={() => onSelect(topic)} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
