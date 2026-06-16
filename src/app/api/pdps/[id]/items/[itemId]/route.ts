import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/roles";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";
import { patchPdpItemSchema } from "@/lib/schemas";
import {
  notifyPdpItemSubmitted,
  notifyPdpItemReviewed,
  notifyPdpClosed,
} from "@/lib/notifications";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const { id: pdpId, itemId } = await params;
  const parsed = await parseJsonBody(req, patchPdpItemSchema);
  if (parsed.error) return parsed.error;
  const { action, evidenceLink, evidenceNote, reviewComment } = parsed.data;

  const item = await prisma.pdpItem.findUnique({
    where: { id: itemId },
    include: {
      pdp: {
        select: {
          id: true,
          status: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });
  if (!item || item.pdpId !== pdpId) return notFound("PDP item not found");
  if (item.pdp.status !== "ACTIVE") {
    return badRequest("The plan must be active before its items can be worked on");
  }

  const isOwner = me.id === item.pdp.user.id;
  const isReviewer = isAdmin(me.role) || (!!item.reviewerId && me.id === item.reviewerId);

  // ---- Employee actions: start / submit ----
  if (action === "start" || action === "submit") {
    if (!isOwner) return forbidden("Only the plan's owner can update their tasks");

    if (action === "start") {
      if (item.status !== "NOT_STARTED") {
        return badRequest("Item can only be started from the 'not started' state");
      }
      const updated = await prisma.pdpItem.update({
        where: { id: itemId },
        data: { status: "IN_PROGRESS" },
      });
      return NextResponse.json(updated);
    }

    // submit
    if (item.status !== "IN_PROGRESS" && item.status !== "REWORK") {
      return badRequest("Item must be in progress before it can be submitted");
    }
    const link = (evidenceLink ?? "").trim();
    if (item.type === "PRACTICE" && !link) {
      return badRequest("A link to the implementation is required for practical tasks");
    }
    const updated = await prisma.pdpItem.update({
      where: { id: itemId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        evidenceLink: link || null,
        evidenceNote: evidenceNote?.trim() || null,
      },
    });

    if (item.reviewer) {
      await notifyPdpItemSubmitted(item.reviewer, item.pdp.user.name, pdpId, item.title);
    } else {
      await notifyAdminsOfUnassignedSubmission(item.pdp.user.name, pdpId, item.title);
    }
    return NextResponse.json(updated);
  }

  // ---- Reviewer actions: verify / rework ----
  if (!isReviewer) return forbidden("Only the assigned reviewer can review this task");
  if (item.status !== "SUBMITTED") {
    return badRequest("Only a submitted item can be reviewed");
  }

  if (action === "rework") {
    const updated = await prisma.pdpItem.update({
      where: { id: itemId },
      data: {
        status: "REWORK",
        reviewedAt: new Date(),
        reviewComment: reviewComment?.trim() || null,
      },
    });
    await notifyPdpItemReviewed(item.pdp.user, pdpId, item.title, false, updated.reviewComment);
    return NextResponse.json(updated);
  }

  // verify — accept the item, then close the plan if everything is verified.
  const { updated, planClosed } = await prisma.$transaction(async (tx) => {
    const updated = await tx.pdpItem.update({
      where: { id: itemId },
      data: {
        status: "VERIFIED",
        reviewedAt: new Date(),
        reviewComment: reviewComment?.trim() || null,
      },
    });
    const remaining = await tx.pdpItem.count({
      where: { pdpId, status: { not: "VERIFIED" } },
    });
    let planClosed = false;
    if (remaining === 0) {
      await tx.pdp.update({ where: { id: pdpId }, data: { status: "COMPLETED" } });
      planClosed = true;
    }
    return { updated, planClosed };
  });

  await notifyPdpItemReviewed(item.pdp.user, pdpId, item.title, true, null);
  if (planClosed) await notifyPdpClosed(item.pdp.user);

  return NextResponse.json(updated);
}

/** No manager assigned to the item — fall back to notifying admins. */
async function notifyAdminsOfUnassignedSubmission(
  subjectName: string,
  pdpId: string,
  itemTitle: string
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true },
  });
  await Promise.all(
    admins.map((admin) => notifyPdpItemSubmitted(admin, subjectName, pdpId, itemTitle))
  );
}
