import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";

export async function GET() {
  const { error } = await requireAssessor();
  if (error) return error;

  const assessments = await prisma.assessment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      sessions: {
        orderBy: { order: "asc" },
      },
    },
  });

  return NextResponse.json(assessments);
}
