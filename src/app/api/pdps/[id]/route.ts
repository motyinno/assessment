import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp, canViewPdp, pdpPlanInclude, planSchema, savePlan } from "@/lib/pdp-plan";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";
import { gradeLabel } from "@/lib/grades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadPdp(id: string) {
  return prisma.pdp.findUnique({
    where: { id },
    include: {
      ...pdpPlanInclude,
      user: { select: { id: true, name: true, email: true, grade: true, managerId: true, manager: { select: { name: true } } } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } },
      assessment: { select: { id: true, title: true, completedAt: true } },
    },
  });
}

/** The plan with its goals/items, plus what the viewer may do with it. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const pdp = await loadPdp(params.id);
  if (!pdp) return notFound("PDP not found");
  if (!(await canViewPdp(me, pdp, pdp.user))) return forbidden();

  const isComposer = await canComposePdp(me, pdp.user);
  const canEdit = isComposer && (pdp.status === "DRAFT" || pdp.status === "ACTIVE");
  return NextResponse.json({
    ...pdp,
    user: { ...pdp.user, gradeLabel: gradeLabel(pdp.user.grade) },
    canEdit,
    canRetry: isComposer && pdp.status === "FAILED",
    // The employee works through the plan; the manager closes it.
    isOwner: me.id === pdp.userId,
    canComplete: isComposer && pdp.status === "ACTIVE",
    docStale:
      pdp.goals.length > 0 &&
      !!pdp.docSyncedAt &&
      !!pdp.planUpdatedAt &&
      pdp.planUpdatedAt > pdp.docSyncedAt,
  });
}

/** Save the whole plan from the builder (autosave). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { id: true, name: true, email: true, managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(auth.session.user, pdp.user))) return forbidden();
  if (pdp.status !== "DRAFT" && pdp.status !== "ACTIVE") {
    return badRequest("This PDP can't be edited right now");
  }

  const parsed = await parseJsonBody(req, planSchema);
  if (parsed.error) return parsed.error;
  await savePlan(pdp.id, parsed.data.goals);

  const fresh = await prisma.pdp.findUniqueOrThrow({ where: { id: pdp.id }, include: pdpPlanInclude });
  return NextResponse.json({ goals: fresh.goals, planUpdatedAt: fresh.planUpdatedAt });
}

/**
 * Remove a PDP that never reached the employee: a failed or abandoned draft.
 * Active/completed plans have a real document and history behind them.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { id: true, managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(auth.session.user, pdp.user))) return forbidden();
  if (pdp.status !== "FAILED" && pdp.status !== "DRAFT") {
    return badRequest("Only drafts and failed PDPs can be removed");
  }

  await prisma.pdp.delete({ where: { id: pdp.id } });
  return NextResponse.json({ ok: true });
}
