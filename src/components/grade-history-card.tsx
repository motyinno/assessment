"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Minus, CircleSlash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  type GradeChangeDirection,
  type GradeTimeline,
} from "@/lib/grade-history";

const DIRECTION_META: Record<
  GradeChangeDirection,
  { icon: typeof ArrowUpRight; className: string; label: string }
> = {
  up: {
    icon: ArrowUpRight,
    className: "bg-success/15 text-success",
    label: "Promotion",
  },
  down: {
    icon: ArrowDownRight,
    className: "bg-destructive/15 text-destructive",
    label: "Downgrade",
  },
  set: {
    icon: Minus,
    className: "bg-muted text-muted-foreground",
    label: "Grade set",
  },
  cleared: {
    icon: CircleSlash,
    className: "bg-muted text-muted-foreground",
    label: "Grade cleared",
  },
};

const SOURCE_LABEL: Record<string, string> = {
  ASSESSMENT: "via assessment",
  MANUAL: "set manually",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US");
}

/**
 * A person's grade timeline: where they started, every recorded change, and how
 * long each level lasted.
 *
 * Fed by GET /api/users/[id]/grade-history, which is readable only by the
 * person themselves, their manager, or an admin — so this card renders a plain
 * "not available" line on 403 rather than an error, and callers don't need to
 * duplicate the permission rule to decide whether to mount it.
 */
export function GradeHistoryCard({
  userId,
  title = "Growth history",
  refreshKey,
}: {
  userId: string;
  title?: string;
  /**
   * Changing this refetches the timeline. Pass the viewed user's current grade
   * so an edit made elsewhere on the page (the admin/manager edit dialog) is
   * reflected here without a reload — a grade change is precisely what adds a
   * row to this history.
   */
  refreshKey?: string | number | null;
}) {
  const [timeline, setTimeline] = useState<GradeTimeline | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">(
    "loading"
  );

  useEffect(() => {
    let active = true;
    setState("loading");
    fetch(`/api/users/${userId}/grade-history`)
      .then(async (r) => {
        if (!active) return;
        if (r.status === 401 || r.status === 403) {
          setState("denied");
          return;
        }
        if (!r.ok) {
          setState("error");
          return;
        }
        setTimeline(await r.json());
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  if (state === "denied") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Every recorded grade change, newest first.
        </p>
      </CardHeader>
      <CardContent>
        {state === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : state === "error" || !timeline ? (
          <p className="text-sm text-destructive">Failed to load growth history</p>
        ) : (
          <Timeline timeline={timeline} />
        )}
      </CardContent>
    </Card>
  );
}

function Timeline({ timeline }: { timeline: GradeTimeline }) {
  const { events, currentGradeLabel, startingGradeLabel, promotions } = timeline;
  const atCurrent = formatDuration(timeline.daysAtCurrentGrade);

  if (events.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold tracking-tight">
            {currentGradeLabel}
          </span>
          <span className="text-sm text-muted-foreground">current grade</span>
        </div>
        <p className="text-sm text-muted-foreground">
          No grade changes recorded yet. Changes appear here once a grade is
          set by an assessment review or edited by an admin or manager.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-semibold tracking-tight">
          {currentGradeLabel}
        </span>
        <span className="text-sm text-muted-foreground">
          current grade
          {atCurrent ? ` · ${atCurrent} at this level` : ""}
        </span>
        <span className="text-sm text-muted-foreground">
          · {promotions} {promotions === 1 ? "promotion" : "promotions"}
          {timeline.startingGrade ? ` since ${startingGradeLabel}` : ""}
        </span>
      </div>

      <ol className="relative space-y-4 border-l pl-6">
        {events.map((e) => {
          const meta = DIRECTION_META[e.direction];
          const Icon = meta.icon;
          const held = formatDuration(e.daysAtPreviousGrade);
          return (
            <li key={e.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-background",
                  meta.className
                )}
                aria-hidden="true"
              >
                <Icon className="h-3 w-3" />
              </span>

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">
                  {e.previousGrade ? `${e.previousGradeLabel} → ` : ""}
                  {e.newGradeLabel}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(e.at)} · {SOURCE_LABEL[e.source] ?? "set manually"}
                  {e.actorName ? ` by ${e.actorName}` : ""}
                </span>
              </div>

              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="sr-only">{meta.label}. </span>
                {held && <span>{held} at {e.previousGradeLabel}</span>}
                {e.assessmentId && (
                  <Link
                    href={`/assessments/${e.assessmentId}`}
                    className="text-primary hover:underline"
                  >
                    {e.assessmentTitle ?? "View assessment"}
                  </Link>
                )}
              </div>

              {e.note && (
                <p className="mt-1 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                  {e.note}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
