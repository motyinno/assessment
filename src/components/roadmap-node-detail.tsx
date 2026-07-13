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
import { Check } from "lucide-react";

const BAND_DOT: Record<Grade, string> = {
  jun: "bg-emerald-400",
  mid: "bg-blue-400",
  sen: "bg-purple-400",
};

/**
 * Detail dialog for a single topic, scoped to the focal grade: shows that
 * level's skills as individually checkable "questions", a resolved/total count,
 * and a "mark all" shortcut. Read-only when `canEdit` is false.
 */
export function RoadmapNodeDetail({
  topic,
  focalGrade,
  canEdit,
  onClose,
  onSetResolved,
  saving,
}: {
  topic: RoadmapTopicDTO | null;
  focalGrade: Grade;
  canEdit: boolean;
  onClose: () => void;
  onSetResolved: (
    topic: RoadmapTopicDTO,
    grade: Grade,
    resolvedSkills: string[]
  ) => void;
  saving: boolean;
}) {
  const open = topic !== null;

  const meta = topic ? STATUS_META[topic.status[focalGrade]] : null;
  const skills = topic ? topic.skills[focalGrade] : [];
  const score = topic ? topic.scores[focalGrade] : null;
  const resolved = new Set(topic ? topic.resolvedSkills[focalGrade] : []);
  const allResolved = skills.length > 0 && resolved.size >= skills.length;

  function commit(next: Set<string>) {
    if (!topic) return;
    // Preserve skill order; only keep skills that still exist.
    onSetResolved(topic, focalGrade, skills.filter((s) => next.has(s)));
  }

  function toggleSkill(skill: string) {
    if (!canEdit) return;
    const next = new Set(resolved);
    if (next.has(skill)) next.delete(skill);
    else next.add(skill);
    commit(next);
  }

  function toggleAll() {
    if (!canEdit) return;
    commit(allResolved ? new Set() : new Set(skills));
  }

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
                {BAND_LABELS[focalGrade]}-level questions ·{" "}
                {score !== null ? `assessed ${score}/10` : "not assessed"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={cn("rounded px-2 py-0.5 text-xs font-medium", meta.badge)}>
                  {meta.label}
                </span>
                {skills.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {resolved.size}/{skills.length} resolved
                  </span>
                )}
              </div>
              {canEdit && skills.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={allResolved ? "secondary" : "outline"}
                  disabled={saving}
                  onClick={toggleAll}
                >
                  {allResolved ? "Unmark all" : "Mark all as resolved"}
                </Button>
              )}
            </div>

            {skills.length === 0 ? (
              <p className="text-[13px] italic text-muted-foreground/60">
                No questions listed at this level.
              </p>
            ) : (
              <ul className="space-y-1">
                {skills.map((skill, i) => {
                  const checked = resolved.has(skill);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={!canEdit || saving}
                        onClick={() => toggleSkill(skill)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-relaxed transition-colors",
                          canEdit && "hover:bg-muted/50",
                          !canEdit && "cursor-default"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-emerald-600 bg-emerald-500 text-white"
                              : "border-border bg-background"
                          )}
                        >
                          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className={cn(checked ? "text-muted-foreground line-through" : "text-foreground/85")}>
                          {skill}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
