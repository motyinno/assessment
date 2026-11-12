import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadClimb } from "@/lib/climb";
import { READY_THRESHOLD, monthsBetween, type SummitPush } from "@/lib/climb-chapters";
import { gradeLabel } from "@/lib/grades";
import { STATUS_META, BAND_LABELS, type RoadmapStatus } from "@/lib/roadmap-types";
import { LinkButton } from "@/components/ui/link-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChapterTrail } from "@/components/brand/chapter-trail";
import { SelfCheckButton, SelfCheckScore } from "@/components/self-check-dialog";
import { SELF_CHECK_PASS } from "@/lib/self-check";
import { cn } from "@/lib/utils";

const monthYear = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const dayMonth = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status as RoadmapStatus];
  if (!meta) return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.badge)}>{meta.label}</span>;
}

function PushPanel({ push, target }: { push: SummitPush; target: string }) {
  switch (push.kind) {
    case "summit":
      return <p className="text-sm text-muted-foreground">You&apos;re on the summit. Time to help others climb.</p>;
    case "scheduled":
      return (
        <p className="text-sm text-foreground">
          Your assessment for {target} is {push.scheduledAt ? <>on <b>{dayMonth(push.scheduledAt)}</b></> : "being scheduled"}.
        </p>
      );
    case "requested":
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">You&apos;ve asked for an assessment. It&apos;s waiting for an admin to schedule it.</p>
          <LinkButton href="/request-assessment" size="sm" variant="outline">
            See your request
          </LinkButton>
        </div>
      );
    case "ready":
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">You look ready for {target}. Time for the summit push.</p>
          <LinkButton href="/request-assessment" size="sm">
            Request an assessment
          </LinkButton>
        </div>
      );
    case "needs-cert":
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground">
            You look ready for {target}, but an upgrade needs at least one certificate. Add it to your profile first.
          </p>
          <LinkButton href="/profile" size="sm" variant="outline">
            Add a certificate
          </LinkButton>
        </div>
      );
    case "climbing":
      return (
        <p className="text-sm text-muted-foreground">
          At {READY_THRESHOLD}% you reach the high camp and can request the assessment. Tick off roadmap questions and
          work through your plan goals to get there.
        </p>
      );
  }
}

export default async function ClimbPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const climb = await loadClimb(session.user.id);
  const { grade, target, chapters, plans, readiness, push } = climb;
  const current = chapters.current;

  // One trail for the whole chapter: every plan's goals, oldest plan first.
  // They mark the route; the climber's height is readiness, not plan progress.
  const waypoints = plans.flatMap((p) => p.waypoints);
  const itemsOf = (ws: typeof waypoints) =>
    ws.reduce((acc, w) => ({ done: acc.done + w.done, total: acc.total + w.total }), { done: 0, total: 0 });

  return (
    <div className="space-y-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your climb</h1>
          <p className="page-subtitle mt-1">
            {grade && target ? (
              <>
                Chapter {current.number} · {gradeLabel(grade)} → {gradeLabel(target)}
                {current.startedAt && <> · since {monthYear(current.startedAt)}</>}
              </>
            ) : grade ? (
              <>Summit reached at {gradeLabel(grade)}</>
            ) : (
              <>Your grade isn&apos;t set yet. An assessment sets your first camp.</>
            )}
          </p>
        </div>
      </div>

      {grade && target && (
        <>
          <Card className="climb-rise overflow-hidden" style={{ ["--i" as string]: 1 }}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle>This leg</CardTitle>
                <p className="max-w-xl text-sm text-muted-foreground">
                  You climb as your roadmap for {gradeLabel(target)} fills up. At {READY_THRESHOLD}% you reach the high
                  camp; the summit itself is only taken at an assessment.
                  {plans.length
                    ? " Plan goals are waypoints on the route."
                    : " No development plan for this leg yet. Your manager composes it with you."}
                </p>
              </div>
              {readiness && (
                <div className="shrink-0 text-right">
                  <p className="font-display text-3xl font-extrabold tabular-nums">{readiness.percent}%</p>
                  <p className="text-xs text-muted-foreground">ready for {gradeLabel(target)}</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <ChapterTrail
                fromLabel={gradeLabel(grade)}
                toLabel={gradeLabel(target)}
                waypoints={waypoints.map((w) => ({
                  id: w.id,
                  done: w.total > 0 && w.done === w.total,
                  checked: (w.selfCheck ?? 0) >= SELF_CHECK_PASS,
                }))}
                readiness={readiness?.percent ?? 0}
              />
              {plans.map((plan, pi) => {
                // Waypoint numbers run on across plans, matching the trail.
                const first = plans.slice(0, pi).reduce((n, p) => n + p.waypoints.length, 0);
                const items = itemsOf(plan.waypoints);
                return (
                  <div key={plan.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{plan.fileName}</span>
                      <span>· {plan.status === "COMPLETED" ? "closed" : "active"}</span>
                      <span className="tabular-nums">
                        · {items.done} of {items.total} items
                      </span>
                    </div>
                    <ol className="grid gap-2 md:grid-cols-2">
                      {plan.waypoints.map((w, i) => {
                        const finished = w.total > 0 && w.done === w.total;
                        return (
                          <li key={w.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold",
                                finished ? "bg-trail text-white" : "border text-muted-foreground"
                              )}
                            >
                              {first + i + 1}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className="text-sm font-medium leading-snug">{w.title}</p>
                              <div className="flex items-center gap-2">
                                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-trail" style={{ width: `${w.total ? (w.done / w.total) * 100 : 0}%` }} />
                                </div>
                                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {w.done}/{w.total}
                                </span>
                                {w.topicStatus && <StatusPill status={w.topicStatus} />}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                {w.selfCheck !== null && <SelfCheckScore score={w.selfCheck} />}
                                <SelfCheckButton pdpId={plan.id} goalId={w.id} goalTitle={w.title} />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <Link href={`/pdps/${plan.id}`} className="inline-block text-sm font-medium text-primary hover:underline">
                      Open the plan →
                    </Link>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="climb-rise grid gap-4 md:grid-cols-2" style={{ ["--i" as string]: 2 }}>
            <Card>
              <CardHeader>
                <CardTitle>Summit push</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {readiness && (
                  <p className="text-xs text-muted-foreground">
                    {readiness.mastered} of {readiness.topics} {BAND_LABELS[readiness.band]} topics mastered on your roadmap
                  </p>
                )}
                <PushPanel push={push} target={gradeLabel(target)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Focus next</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {readiness && readiness.focus.length > 0 ? (
                  <>
                    <ul className="space-y-2">
                      {readiness.focus.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{t.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{t.section}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {t.resolved}/{t.total}
                            </span>
                            <StatusPill status={t.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <Link href="/tech-matrix?view=roadmap" className="inline-block text-sm font-medium text-primary hover:underline">
                      Open your roadmap →
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Every topic of this band is mastered on your roadmap.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="climb-rise" style={{ ["--i" as string]: 3 }}>
        <CardHeader>
          <CardTitle>Expedition log</CardTitle>
        </CardHeader>
        <CardContent>
          {chapters.past.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Camps you take will show up here, with the plans that got you there.
            </p>
          ) : (
            <ol className="relative space-y-6 border-l-2 border-dashed border-trail/50 pl-6">
              {[...chapters.past].reverse().map((c) => (
                <li key={c.number} className="relative">
                  <span className="absolute -left-[33px] top-0.5 size-4 rounded-full border-2 border-card bg-trail" />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">
                      Chapter {c.number} · {c.fromGrade ? `${gradeLabel(c.fromGrade)} → ` : ""}
                      {gradeLabel(c.toGrade)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Camp taken {monthYear(c.reachedAt)}
                      {c.startedAt && <> · took {monthsBetween(c.startedAt, c.reachedAt)} mo</>}
                      {c.attempts > 0 && <> · {c.attempts + 1} attempts</>}
                    </p>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <Link href={`/assessments/${c.assessmentId}`} className="text-primary hover:underline">
                      Assessment
                    </Link>
                    {c.pdps.map((p) => (
                      <Link key={p.id} href={`/pdps/${p.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
                        {p.fileName}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
