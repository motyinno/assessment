"use client";

import type { Grade } from "@/lib/types";
import {
  BAND_LABELS,
  STATUS_META,
  type RoadmapTopicDTO,
} from "@/lib/roadmap-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2 } from "lucide-react";

const BAND_DOT: Record<Grade, string> = {
  jun: "bg-emerald-400",
  mid: "bg-blue-400",
  sen: "bg-purple-400",
};

/**
 * Detail dialog for a single topic, scoped to the focal grade: shows that
 * level's skills, its status/score, and a "Mark as done" toggle that persists
 * a manual checkmark for that level.
 */
export function RoadmapNodeDetail({
  topic,
  focalGrade,
  onClose,
  onToggle,
  saving,
}: {
  topic: RoadmapTopicDTO | null;
  focalGrade: Grade;
  onClose: () => void;
  onToggle: (topic: RoadmapTopicDTO, grade: Grade, done: boolean) => void;
  saving: boolean;
}) {
  const open = topic !== null;

  const meta = topic ? STATUS_META[topic.status[focalGrade]] : null;
  const skills = topic ? topic.skills[focalGrade] : [];
  const score = topic ? topic.scores[focalGrade] : null;
  const done = topic ? topic.manualDone[focalGrade] : false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {topic && meta && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", BAND_DOT[focalGrade])} />
                {topic.title}
              </DialogTitle>
              <DialogDescription>
                {BAND_LABELS[focalGrade]}-level skills ·{" "}
                {score !== null ? `assessed ${score}/10` : "not assessed"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2">
              <span className={cn("rounded px-2 py-0.5 text-xs font-medium", meta.badge)}>
                {meta.label}
              </span>
              <Button
                type="button"
                size="sm"
                variant={done ? "secondary" : "outline"}
                disabled={saving}
                onClick={() => onToggle(topic, focalGrade, !done)}
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : done ? (
                  <Check />
                ) : null}
                {done ? "Done" : "Mark as done"}
              </Button>
            </div>

            {skills.length === 0 ? (
              <p className="text-[13px] italic text-muted-foreground/60">
                No skills listed at this level.
              </p>
            ) : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {skills.map((skill, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/85"
                  >
                    <span className={cn("mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full", BAND_DOT[focalGrade])} />
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
