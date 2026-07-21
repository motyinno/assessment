import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import {
  AssessmentStatisticsView,
  type AssessmentRow,
} from "@/components/assessment-statistics-view";

export default async function AssessmentStatisticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdmin(session.user.role)) redirect("/dashboard");

  const assessments = await prisma.assessment.findMany({
    include: {
      participants: { include: { user: true } },
      sessions: { select: { assessorId: true, assessorName: true, status: true } },
    },
  });

  // Build the conductor set per assessment: assigned ASSESSOR participants plus
  // anyone who actually ran a completed stage (session assessor). Deduplicated
  // by user id (falling back to assessor name when a session has no id).
  const rows: AssessmentRow[] = assessments.map((a) => {
    const conductors = new Map<string, string>();
    const subjects = new Map<string, string>();
    for (const p of a.participants) {
      if (p.participantRole === "ASSESSOR") conductors.set(p.userId, p.user.name);
      else if (p.participantRole === "SUBJECT") subjects.set(p.userId, p.user.name);
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
