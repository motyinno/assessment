import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { isUserInScope } from "@/lib/admin-scope";
import { countForType, suggestAssessors } from "@/lib/assessor-suggestion";
import { forbidden, notFound } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;

  const { id } = await params;
  const typeParam = req.nextUrl.searchParams.get("assessmentType");
  const assessmentType: "GENERAL" | "PDP_CHECK" =
    typeParam === "PDP_CHECK" ? "PDP_CHECK" : "GENERAL";

  const request = await prisma.assessmentRequest.findUnique({
    where: { id },
    select: { userId: true, grade: true },
  });
  if (!request) return notFound("Request not found");
  if (!(await isUserInScope(request.userId, auth.scope))) return forbidden();

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
