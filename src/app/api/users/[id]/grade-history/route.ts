import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { notFound } from "@/lib/api-helpers";
import { buildGradeTimeline, type GradeChangeRecord } from "@/lib/grade-history";

/**
 * GET /api/users/[id]/grade-history — the "Growth history" timeline.
 *
 * Access mirrors the other mutating /api/users/[id]/* endpoints via
 * `requireUserAccess`: the person themselves, an admin, or their manager. A
 * grade history is a sharper piece of data than a current grade (it shows
 * demotions and how long someone sat at a level), so it is deliberately NOT
 * readable by every authenticated user the way GET /api/users/[id] is.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const auth = await requireUserAccess(id);
  if (auth.error) return auth.error;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, grade: true },
  });
  if (!user) return notFound("User not found");

  const rows = await prisma.gradeAuditLog.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      previousGrade: true,
      newGrade: true,
      source: true,
      assessmentId: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true } },
      assessment: { select: { title: true } },
    },
  });

  const records: GradeChangeRecord[] = rows.map((r) => ({
    id: r.id,
    previousGrade: r.previousGrade,
    newGrade: r.newGrade,
    source: r.source,
    assessmentId: r.assessmentId,
    assessmentTitle: r.assessment?.title ?? null,
    actorName: r.actor?.name ?? null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json(buildGradeTimeline(records, user.grade));
}
