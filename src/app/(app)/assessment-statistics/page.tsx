import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { getAdminDepartmentScope } from "@/lib/admin-scope";
import {
  AssessmentStatisticsView,
  type AssessmentRow,
} from "@/components/assessment-statistics-view";

export default async function AssessmentStatisticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  const scope = await getAdminDepartmentScope(session.user);
  if (scope && scope.size === 0) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">Assessment statistics</h1>
            <p className="page-subtitle mt-1">
              You're not currently assigned to a department, so there's nothing to show.
            </p>
          </div>
        </div>
        <AssessmentStatisticsView rows={[]} />
      </div>
    );
  }

  const assessments = await prisma.assessment.findMany({
    where: scope
      ? {
          participants: {
            some: {
              participantRole: "SUBJECT",
              user: { departments: { some: { departmentId: { in: [...scope] } } } },
            },
          },
        }
      : undefined,
    include: {
      // Explicit select (S13): `include: { user: true }` used to drag the
      // *whole* User row — including googleAccessToken/googleRefreshToken —
      // into this client component's props for every participant of every
      // assessment. Nothing here needs more than id/name/isArchived.
      participants: {
        select: {
          userId: true,
          participantRole: true,
          user: {
            select: {
              id: true,
              name: true,
              isArchived: true,
              // The subject's DIVISION, not their membership list. HRM puts one
              // person in ~2.6 units at every level at once, so shipping the
              // raw list made this page group by Unit, Division, Department and
              // Team interchangeably. A person has exactly one division.
              division: { select: { id: true, name: true } },
            },
          },
        },
      },
      sessions: { select: { assessorId: true, assessorName: true, status: true } },
    },
  });

  // Build the conductor set per assessment: assigned ASSESSOR participants plus
  // anyone who actually ran a completed stage (session assessor). Deduplicated
  // by user id (falling back to assessor name when a session has no id).
  const rows: AssessmentRow[] = assessments.map((a) => {
    const conductors = new Map<string, string>();
    const subjects = new Map<string, string>();
    // A Map, not one value: an assessment can have several subjects, and they
    // need not share a division.
    const subjectDivisions = new Map<string, { id: string; name: string }>();
    for (const p of a.participants) {
      if (p.participantRole === "ASSESSOR") conductors.set(p.userId, p.user.name);
      else if (p.participantRole === "SUBJECT") {
        subjects.set(p.userId, p.user.name);
        if (p.user.division) subjectDivisions.set(p.user.division.id, p.user.division);
      }
    }
    for (const s of a.sessions) {
      if (s.status !== "COMPLETED") continue;
      const key = s.assessorId ?? s.assessorName;
      if (!key) continue;
      const name = s.assessorName ?? (s.assessorId ? conductors.get(s.assessorId) : null) ?? key;
      if (!conductors.has(key)) conductors.set(key, name);
    }
    return {
      id: a.id,
      status: a.status,
      grade: a.grade,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      reviewStatus: a.reviewStatus,
      gradeUpgraded: a.gradeUpgraded,
      conductors: [...conductors.entries()].map(([id, name]) => ({ id, name })),
      subjects: [...subjects.entries()].map(([id, name]) => ({ id, name })),
      subjectDivisions: [...subjectDivisions.values()],
    };
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assessment statistics</h1>
          <p className="page-subtitle mt-1">
            Aggregate view of completed assessments — grades, volume over time, and who conducted them.
          </p>
        </div>
      </div>
      <AssessmentStatisticsView rows={rows} />
    </div>
  );
}
