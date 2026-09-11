import prisma from "@/lib/prisma";
import { gradeRank } from "@/lib/grades";

export interface AssessorCandidate {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  ongoingCount: number;
  proximity: 0 | 1 | 2;
  departments: Array<{ id: string; name: string }>;
}

interface Unit {
  id: string;
  parentId: string | null;
}

/**
 * Organizational proximity between a subject and a candidate, based on their
 * department memberships (`UserDepartment`).
 *
 *  0 — subject and candidate share at least one unit (by `id`).
 *  1 — subject and candidate have units with the same non-null `parentId`
 *      (neighboring units under the same parent).
 *  2 — everything else, including either side having no units.
 *
 * Pure and side-effect free; never throws on empty input.
 */
export function proximityRank(
  subjectUnits: Unit[],
  candidateUnits: Unit[]
): 0 | 1 | 2 {
  const subjectIds = new Set(subjectUnits.map((u) => u.id));
  if (candidateUnits.some((u) => subjectIds.has(u.id))) return 0;

  const subjectParentIds = new Set(
    subjectUnits.map((u) => u.parentId).filter((id): id is string => id !== null)
  );
  if (
    candidateUnits.some(
      (u) => u.parentId !== null && subjectParentIds.has(u.parentId)
    )
  ) {
    return 1;
  }

  return 2;
}

interface AssessorCandidateInput {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  ongoingCount: number;
  departments: Array<{ id: string; name: string }>;
}

/**
 * Rank candidates best-first: organizational proximity to the subject, then
 * current workload, then grade closeness to the subject, then name for a
 * deterministic order. Pure — takes candidates already filtered and enriched
 * with their department units.
 */
export function rankCandidates(
  candidates: Array<AssessorCandidateInput & { units: Unit[] }>,
  ctx: { subjectRank: number; subjectUnits: Unit[] }
): AssessorCandidate[] {
  return candidates
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      grade: c.grade,
      ongoingCount: c.ongoingCount,
      departments: c.departments,
      proximity: proximityRank(ctx.subjectUnits, c.units),
    }))
    .sort((a, b) => {
      if (a.proximity !== b.proximity) return a.proximity - b.proximity;
      if (a.ongoingCount !== b.ongoingCount)
        return a.ongoingCount - b.ongoingCount;
      const ra = gradeRank(a.grade);
      const rb = gradeRank(b.grade);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Pick candidate assessors for a given subject user, following the rules:
 *  1. Candidate's `managerId` must not match the subject's `manager` field.
 *  2. Candidate's grade rank must be >= subject's grade rank.
 *  3. Prefer candidates organizationally close to the subject (shared unit,
 *     then neighboring unit), then those with fewer currently active
 *     (PLANNED|IN_PROGRESS) assessments.
 *
 * Returns every eligible assessor ranked best-first. The caller slices the
 * needed count (2 for GENERAL, 1 for PDP_CHECK).
 */
export async function suggestAssessors(opts: {
  subjectId: string;
  subjectGrade: string;
}): Promise<AssessorCandidate[]> {
  const { subjectId, subjectGrade } = opts;

  const subject = await prisma.user.findUnique({
    where: { id: subjectId },
    select: { id: true, managerId: true },
  });
  const managerId = subject?.managerId ?? null;

  const assessors = await prisma.user.findMany({
    where: {
      role: { in: ["ASSESSOR", "MANAGER", "ADMIN"] },
      id: { not: subjectId },
      isArchived: false,
    },
    select: { id: true, name: true, email: true, grade: true },
  });

  const subjectRank = gradeRank(subjectGrade);
  const assessorIds = assessors.map((a) => a.id);

  // Count each assessor's ongoing (non-terminal) assessments in one query.
  const ongoing = assessorIds.length
    ? await prisma.assessmentParticipant.groupBy({
        by: ["userId"],
        where: {
          userId: { in: assessorIds },
          participantRole: "ASSESSOR",
          assessment: { status: { in: ["PLANNED", "IN_PROGRESS"] } },
        },
        _count: { _all: true },
      })
    : [];
  const ongoingById = new Map(ongoing.map((o) => [o.userId, o._count._all]));

  // Units for the subject and every candidate in one query.
  const userDepartments = await prisma.userDepartment.findMany({
    where: { userId: { in: [subjectId, ...assessorIds] } },
    select: { userId: true, departmentId: true },
  });
  const departmentIdsByUser = new Map<string, string[]>();
  for (const ud of userDepartments) {
    const list = departmentIdsByUser.get(ud.userId) ?? [];
    list.push(ud.departmentId);
    departmentIdsByUser.set(ud.userId, list);
  }

  // Department details (name + parentId) for every unit that appeared above.
  const allDepartmentIds = [...new Set(userDepartments.map((ud) => ud.departmentId))];
  const departments = allDepartmentIds.length
    ? await prisma.department.findMany({
        where: { id: { in: allDepartmentIds } },
        select: { id: true, name: true, parentId: true },
      })
    : [];
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  function unitsFor(userId: string): Unit[] {
    return (departmentIdsByUser.get(userId) ?? [])
      .map((id) => departmentById.get(id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map((d) => ({ id: d.id, parentId: d.parentId }));
  }

  function departmentsFor(userId: string): Array<{ id: string; name: string }> {
    return (departmentIdsByUser.get(userId) ?? [])
      .map((id) => departmentById.get(id))
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map((d) => ({ id: d.id, name: d.name }));
  }

  const subjectUnits = unitsFor(subjectId);

  const eligible = assessors
    .filter((a) => {
      // Rule 1: subject's manager cannot assess them
      if (managerId && a.id === managerId) {
        return false;
      }
      // Rule 2: grade must be >= subject's grade
      return gradeRank(a.grade) >= subjectRank;
    })
    .map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      grade: a.grade,
      ongoingCount: ongoingById.get(a.id) ?? 0,
      departments: departmentsFor(a.id),
      units: unitsFor(a.id),
    }));

  return rankCandidates(eligible, { subjectRank, subjectUnits });
}

export function countForType(assessmentType: "GENERAL" | "PDP_CHECK"): number {
  return assessmentType === "PDP_CHECK" ? 1 : 2;
}
