import prisma from "@/lib/prisma";
import { gradeRank } from "@/lib/grades";

export interface AssessorCandidate {
  id: string;
  name: string;
  email: string;
  grade: string | null;
  ongoingCount: number;
}

/**
 * Pick candidate assessors for a given subject user, following the rules:
 *  1. Candidate's *name* must not match the subject's `manager` field.
 *  2. Candidate's grade rank must be >= subject's grade rank.
 *  3. Prefer candidates with fewer currently active (PLANNED|IN_PROGRESS) assessments.
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
    },
    select: { id: true, name: true, email: true, grade: true },
  });

  const subjectRank = gradeRank(subjectGrade);

  // Count each assessor's ongoing (non-terminal) assessments in one query.
  const assessorIds = assessors.map((a) => a.id);
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

  const ongoingById = new Map(
    ongoing.map((o) => [o.userId, o._count._all])
  );

  const candidates = assessors
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
    }))
    .sort((a, b) => {
      // Rule 3: fewer ongoing first; tie-break on lower grade (closer to subject),
      // then name for deterministic ordering.
      if (a.ongoingCount !== b.ongoingCount)
        return a.ongoingCount - b.ongoingCount;
      const ra = gradeRank(a.grade);
      const rb = gradeRank(b.grade);
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });

  return candidates;
}

export function countForType(
  assessmentType: "GENERAL" | "PDP_CHECK" | "SYSTEM_DESIGN"
): number {
  // Single-session assessments (PDP review, system design) need one assessor.
  return assessmentType === "GENERAL" ? 2 : 1;
}
