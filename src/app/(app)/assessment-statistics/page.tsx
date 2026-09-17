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
          user: { select: { id: true, name: true, isArchived: true } },
        },
      },
      sessions: { select: { assessorId: true, assessorName: true, status: true } },
    },
  });

  // Departments (S13 §2): one subject can sit in several units (S02), so this
  // is a flat lookup keyed by subject user id, not a join baked into the
  // query above.
  const subjectIds = new Set<string>();
  for (const a of assessments) {
    for (const p of a.participants) {
      if (p.participantRole === "SUBJECT") subjectIds.add(p.userId);
    }
  }
  const memberships = await prisma.userDepartment.findMany({
    where: { userId: { in: [...subjectIds] } },
    select: { userId: true, department: { select: { id: true, name: true } } },
  });
  const departmentsByUser = new Map<string, { id: string; name: string }[]>();
  for (const m of memberships) {
    const list = departmentsByUser.get(m.userId) ?? [];
    list.push(m.department);
    departmentsByUser.set(m.userId, list);
  }

  // Build the conductor set per assessment: assigned ASSESSOR participants plus
  // anyone who actually ran a completed stage (session assessor). Deduplicated
  // by user id (falling back to assessor name when a session has no id).
  const rows: AssessmentRow[] = assessments.map((a) => {
    const conductors = new Map<string, string>();
    const subjects = new Map<string, string>();
    const subjectDepartments = new Map<string, { id: string; name: string }>();
    for (const p of a.participants) {
      if (p.participantRole === "ASSESSOR") conductors.set(p.userId, p.user.name);
      else if (p.participantRole === "SUBJECT") {
        subjects.set(p.userId, p.user.name);
        for (const d of departmentsByUser.get(p.userId) ?? []) subjectDepartments.set(d.id, d);
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
      subjectDepartments: [...subjectDepartments.values()],
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
