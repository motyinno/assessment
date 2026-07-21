import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { countForType, suggestAssessors } from "@/lib/assessor-suggestion";
import { notFound } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("assessmentType");
  const assessmentType: "GENERAL" | "PDP_CHECK" | "SYSTEM_DESIGN" =
    typeParam === "PDP_CHECK" || typeParam === "SYSTEM_DESIGN"
      ? typeParam
      : "GENERAL";

  const request = await prisma.assessmentRequest.findUnique({
    where: { id },
    select: { userId: true, grade: true },
  });
  if (!request) return notFound("Request not found");

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
