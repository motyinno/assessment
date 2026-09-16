import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";
import { loadDepartmentData, pruneEmpty, withDescendantCounts, type DepartmentRow } from "@/lib/departments";
import { GRADE_VALUES } from "@/lib/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PeriodKey = "1m" | "3m" | "6m" | "12m" | "all";
const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  "12m": 365,
  all: null,
};
const DAY_MS = 24 * 60 * 60 * 1000;

function periodCutoff(period: PeriodKey, now: number): Date | null {
  const days = PERIOD_DAYS[period];
  return days == null ? null : new Date(now - days * DAY_MS);
}

/**
 * GET /api/statistics/departments — server-side department cut for the
 * assessment-statistics page (S13). Coverage needs *people* (thousands of
 * them), not assessments, so it's computed here rather than shipped to the
 * browser like the rest of that page's charts.
 *
 * ?department=<id>          scope to this unit's subtree (omitted = every
 *                            unit); 404-shaped empty response for an unknown id
 * ?includeDescendants=0     each row counts only its own direct members
 *                            (default: 1 — rolls up the subtree, same
 *                            path-prefix convention as /api/departments)
 * ?period=1m|3m|6m|12m|all  gates the *completed*-assessment figures
 *                            (withCompletedAssessment, assessments.completed,
 *                            gradeDistribution) by `completedAt`; `total` and
 *                            `cancelled` are all-time — there's no single
 *                            natural date to bucket a still-open assessment by
 *
 * `people`/`withCompletedAssessment`/`withActivePdp` exclude archived users
 * (coverage is about who's here now); `assessments`/`gradeDistribution` count
 * every assessment regardless of the subject's current archived status, so
 * past periods don't shift when someone later leaves (same rule as S06).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const departmentId = sp.get("department");
  const includeDescendants = sp.get("includeDescendants") !== "0";
  const periodParam = sp.get("period") as PeriodKey | null;
  const period: PeriodKey = periodParam && periodParam in PERIOD_DAYS ? periodParam : "all";
  const now = Date.now();
  const cutoff = periodCutoff(period, now);

  const data = await loadDepartmentData(false); // non-archived member counts
  const survivors = pruneEmpty(data.all, data, true); // filterable, non-empty units only

  let scope: DepartmentRow[] = survivors;
  if (departmentId) {
    const target = data.all.find((d) => d.id === departmentId);
    if (!target) {
      return NextResponse.json({ items: [] });
    }
    scope = survivors.filter(
      (d) => d.id === target.id || d.path.startsWith(`${target.path}/`)
    );
  }
  if (scope.length === 0) return NextResponse.json({ items: [] });

  // ---- coverage inputs: non-archived membership only ----
  const nonArchivedMemberships = await prisma.userDepartment.findMany({
    where: { user: { isArchived: false } },
    select: { userId: true, departmentId: true },
  });
  const deptsByUserActive = new Map<string, string[]>();
  for (const m of nonArchivedMemberships) {
    const list = deptsByUserActive.get(m.userId) ?? [];
    list.push(m.departmentId);
    deptsByUserActive.set(m.userId, list);
  }

  const [completedSubjectUsers, activePdpUsers] = await Promise.all([
    prisma.assessmentParticipant.findMany({
      where: {
        participantRole: "SUBJECT",
        user: { isArchived: false },
        assessment: {
          status: "COMPLETED",
          ...(cutoff ? { completedAt: { gte: cutoff } } : {}),
        },
      },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.pdp.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] }, user: { isArchived: false } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const directPeople = new Map<string, number>();
  const directWithCompleted = new Map<string, number>();
  const directWithPdp = new Map<string, number>();
  for (const d of scope) directPeople.set(d.id, data.memberCount.get(d.id) ?? 0);
  const bump = (map: Map<string, number>, deptId: string) =>
    map.set(deptId, (map.get(deptId) ?? 0) + 1);
  for (const { userId } of completedSubjectUsers) {
    for (const deptId of deptsByUserActive.get(userId) ?? []) bump(directWithCompleted, deptId);
  }
  for (const { userId } of activePdpUsers) {
    for (const deptId of deptsByUserActive.get(userId) ?? []) bump(directWithPdp, deptId);
  }

  // ---- assessment/grade inputs: every subject, archived or not (historical) ----
  const subjectParticipants = await prisma.assessmentParticipant.findMany({
    where: { participantRole: "SUBJECT" },
    select: {
      userId: true,
      assessment: { select: { id: true, status: true, grade: true, completedAt: true } },
    },
  });
  const allMemberships = await prisma.userDepartment.findMany({
    select: { userId: true, departmentId: true },
  });
  const deptsByUserAll = new Map<string, string[]>();
  for (const m of allMemberships) {
    const list = deptsByUserAll.get(m.userId) ?? [];
    list.push(m.departmentId);
    deptsByUserAll.set(m.userId, list);
  }

  const directTotal = new Map<string, number>();
  const directCompleted = new Map<string, number>();
  const directCancelled = new Map<string, number>();
  const directGrades = new Map<string, Map<string, number>>();
  // Dedupe by (assessmentId, departmentId) — an assessment with several
  // SUBJECT rows in the same unit should still count once for that unit.
  const seenTotal = new Set<string>();
  const seenCompleted = new Set<string>();
  const seenCancelled = new Set<string>();
  const seenGrade = new Set<string>();
  for (const p of subjectParticipants) {
    const depts = deptsByUserAll.get(p.userId) ?? [];
    const inPeriod = !cutoff || (p.assessment.completedAt != null && p.assessment.completedAt >= cutoff);
    for (const deptId of depts) {
      const totalKey = `${p.assessment.id}:${deptId}`;
      if (!seenTotal.has(totalKey)) {
        seenTotal.add(totalKey);
        bump(directTotal, deptId);
      }
      if (p.assessment.status === "COMPLETED" && inPeriod) {
        const key = `${p.assessment.id}:${deptId}`;
        if (!seenCompleted.has(key)) {
          seenCompleted.add(key);
          bump(directCompleted, deptId);
          const gKey = `${key}:${p.assessment.grade}`;
          if (!seenGrade.has(gKey)) {
            seenGrade.add(gKey);
            const grades = directGrades.get(deptId) ?? new Map<string, number>();
            grades.set(p.assessment.grade, (grades.get(p.assessment.grade) ?? 0) + 1);
            directGrades.set(deptId, grades);
          }
        }
      }
      if (p.assessment.status === "CANCELLED") {
        const key = `${p.assessment.id}:${deptId}`;
        if (!seenCancelled.has(key)) {
          seenCancelled.add(key);
          bump(directCancelled, deptId);
        }
      }
    }
  }

  // ---- roll each direct map up the subtree with the shared path-prefix helper ----
  const rollUp = (direct: Map<string, number>) =>
    includeDescendants ? withDescendantCounts(scope, direct) : direct;
  const people = rollUp(directPeople);
  const withCompletedAssessment = rollUp(directWithCompleted);
  const withActivePdp = rollUp(directWithPdp);
  const total = rollUp(directTotal);
  const completed = rollUp(directCompleted);
  const cancelled = rollUp(directCancelled);
  const gradeDistribution = new Map<string, Record<string, number>>();
  for (const d of scope) {
    const own = directGrades.get(d.id) ?? new Map<string, number>();
    const merged: Record<string, number> = {};
    for (const g of GRADE_VALUES) merged[g] = own.get(g) ?? 0;
    if (includeDescendants) {
      for (const other of scope) {
        if (other.id === d.id || !other.path.startsWith(`${d.path}/`)) continue;
        const otherGrades = directGrades.get(other.id);
        if (!otherGrades) continue;
        for (const [g, c] of otherGrades) merged[g] = (merged[g] ?? 0) + c;
      }
    }
    gradeDistribution.set(d.id, merged);
  }

  const items = scope.map((d) => ({
    departmentId: d.id,
    name: d.name,
    depth: d.depth,
    path: d.path,
    people: people.get(d.id) ?? 0,
    withCompletedAssessment: withCompletedAssessment.get(d.id) ?? 0,
    withActivePdp: withActivePdp.get(d.id) ?? 0,
    assessments: {
      total: total.get(d.id) ?? 0,
      completed: completed.get(d.id) ?? 0,
      cancelled: cancelled.get(d.id) ?? 0,
    },
    gradeDistribution: gradeDistribution.get(d.id) ?? {},
  }));

  return NextResponse.json({ items });
}
