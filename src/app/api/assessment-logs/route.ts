import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";
import { getStaffDivisionScope, userInScopeWhere } from "@/lib/admin-scope";

/**
 * Returns every assessment (within the caller's division, or
 * org-wide for a super-admin) with participants + session timeline.
 * ASSESSOR/MANAGER/ADMIN only.
 */
export async function GET() {
  const auth = await requireAssessor();
  if (auth.error) return auth.error;

  const scope = await getStaffDivisionScope(auth.session.user);

  const assessments = await prisma.assessment.findMany({
    where: scope
      ? {
          participants: {
            some: {
              participantRole: "SUBJECT",
              user: userInScopeWhere(scope),
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
