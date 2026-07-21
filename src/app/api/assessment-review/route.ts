import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

/** Admin queue: assessments the assessor ended and submitted for review. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const assessments = await prisma.assessment.findMany({
    where: { reviewStatus: "PENDING" },
    include: {
      participants: {
        where: { participantRole: "SUBJECT" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              grade: true,
              _count: { select: { certificates: { where: { pinned: true } } } },
            },
          },
        },
      },
      results: {
        select: { id: true, category: true, score: true, comment: true },
      },
    },
    orderBy: { submittedForReviewAt: "desc" },
  });

  return NextResponse.json(assessments);
}
