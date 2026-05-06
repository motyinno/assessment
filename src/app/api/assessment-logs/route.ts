import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";

/**
 * Returns every assessment with participants + session timeline.
 * ASSESSOR/MANAGER/ADMIN only — this endpoint exposes a system-wide view.
 */
export async function GET() {
  const auth = await requireAssessor();
  if (auth.error) return auth.error;

  const assessments = await prisma.assessment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      sessions: { orderBy: { order: "asc" } },
    },
  });

  return NextResponse.json(assessments);
}
