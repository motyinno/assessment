import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { cancelAssessmentSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

/**
 * Cancel an assessment. Admin-only and requires a written reason, which is
 * stored on the assessment for auditing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const parsed = await parseJsonBody(req, cancelAssessmentSchema);
  if (parsed.error) return parsed.error;
  const reason = parsed.data.reason.trim();

  const assessment = await prisma.assessment.findUnique({
    where: { id: params.id },
    select: { status: true },
  });
  if (!assessment) return notFound("Assessment not found");

  if (assessment.status === "CANCELLED") {
    return badRequest("Assessment is already cancelled");
  }
  if (assessment.status === "COMPLETED") {
    return badRequest("A completed assessment can't be cancelled");
  }

  const updated = await prisma.assessment.update({
    where: { id: params.id },
    data: {
      status: "CANCELLED",
      cancellationReason: reason,
      cancelledAt: new Date(),
      cancelledById: me.id,
    },
  });

  return NextResponse.json(updated);
}
