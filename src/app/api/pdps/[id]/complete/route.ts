import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp } from "@/lib/pdp-plan";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";
import { buildRoadmap, writeRoadmapProgress } from "@/lib/roadmap";
import { pdpTopicTicks } from "@/lib/roadmap-types";
import { baseGrade, nextGrade } from "@/lib/grades";
import type { Grade } from "@/lib/types";

const bodySchema = z.object({ note: z.string().trim().max(2000).optional() });

/**
 * The manager closes the whole plan (ACTIVE → COMPLETED). Their call: the
 * employee doesn't have to tick every item first. Closing also ticks the
 * plan's matrix topics on the employee's roadmap, at the grade they're
 * climbing toward — the manager's sign-off is what counts, not self-checks.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { id: true, managerId: true, grade: true } }, goals: { select: { matrixTopicId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(me, pdp.user))) return forbidden("Only the employee's manager can close their PDP");
  if (pdp.status !== "ACTIVE") return badRequest("Only an active PDP can be closed");

  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const note = parsed.data.note || null;

  const updated = await prisma.pdp.update({
    where: { id: pdp.id },
    data: { status: "COMPLETED", completedAt: new Date(), completedById: me.id, completionNote: note },
    select: { id: true, status: true, completedAt: true },
  });

  const topicIds = pdp.goals.flatMap((g) => (g.matrixTopicId ? [g.matrixTopicId] : []));
  let roadmapTopics = 0;
  if (topicIds.length && pdp.user.grade) {
    const band = baseGrade(nextGrade(pdp.user.grade) ?? pdp.user.grade) as Grade;
    const ticks = pdpTopicTicks(await buildRoadmap(pdp.user.id), band, topicIds);
    await writeRoadmapProgress(pdp.user.id, ticks);
    roadmapTopics = ticks.length;
  }
  return NextResponse.json({ ...updated, roadmapTopics });
}
