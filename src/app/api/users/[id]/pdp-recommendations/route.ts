import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp } from "@/lib/pdp-plan";
import { pdpBasisRequestSchema } from "@/lib/schemas";
import { forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";
import { listBasisSources, rankForSubject } from "@/lib/market-signals";
import { DEFAULT_WEIGHTS, defaultTargetBand } from "@/lib/market-fit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(userId: string) {
  const auth = await requireAuth();
  if (auth.error) return { error: auth.error, subject: null };
  const subject = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, grade: true, managerId: true, divisionId: true },
  });
  if (!subject) return { error: notFound("User not found"), subject: null };
  if (!(await canComposePdp(auth.session.user, subject))) {
    return { error: forbidden("Only the employee's direct manager or an admin can create their PDP"), subject: null };
  }
  return { error: null, subject };
}

/** Step 1 of a market-driven PDP: the sources this employee's plan can be based on, and defaults. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;
  const sources = g.subject.divisionId ? await listBasisSources(g.subject.divisionId) : [];
  const assessments = await prisma.assessment.count({
    where: { status: "COMPLETED", participants: { some: { userId: g.subject.id, participantRole: "SUBJECT" } } },
  });
  return NextResponse.json({
    sources,
    completedAssessments: assessments,
    defaults: {
      targetBand: defaultTargetBand(g.subject.grade),
      horizonMonths: 3,
      maxTopics: 5,
      weights: DEFAULT_WEIGHTS,
    },
  });
}

/** Step 2: rank the matrix topics for these settings. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;
  const parsed = await parseJsonBody(req, pdpBasisRequestSchema);
  if (parsed.error) return parsed.error;
  return NextResponse.json(await rankForSubject(g.subject.id, parsed.data));
}
