import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";
import { getStaffDepartmentScope } from "@/lib/admin-scope";

/**
 * Returns every assessment (within the caller's department scope, or
 * org-wide for a super-admin) with participants + session timeline.
 * ASSESSOR/MANAGER/ADMIN only.
 */
export async function GET() {
  const auth = await requireAssessor();
  if (auth.error) return auth.error;

  const scope = await getStaffDepartmentScope(auth.session.user);

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
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true, isArchived: true } },
        },
      },
      sessions: { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(assessments);
}
