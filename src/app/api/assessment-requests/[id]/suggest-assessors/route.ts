import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { countForType, suggestAssessors } from "@/lib/assessor-suggestion";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("assessmentType");
  const assessmentType: "GENERAL" | "PDP_CHECK" =
    typeParam === "PDP_CHECK" ? "PDP_CHECK" : "GENERAL";

  const request = await prisma.assessmentRequest.findUnique({
    where: { id },
    select: { userId: true, grade: true },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const candidates = await suggestAssessors({
    subjectId: request.userId,
    subjectGrade: request.grade,
  });

  const need = countForType(assessmentType);
  const pickedIds = candidates.slice(0, need).map((c) => c.id);

  return NextResponse.json({
    assessmentType,
    need,
    pickedIds,
    candidates,
  });
}
