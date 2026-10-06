import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp, draftGoals, resolveDraftTopics, type PdpGenerationInputs } from "@/lib/pdp-plan";
import { badRequest, errorJson, forbidden, log, notFound, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  matrixTopicId: z.string().nullish(),
});

/**
 * Fresh AI questions + task for one topic. Returns the items without saving —
 * the builder swaps them in and autosaves, so the manager can still undo.
 * Also used to fill a topic just added in the builder.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      status: true,
      assessmentId: true,
      user: { select: { id: true, name: true, grade: true, managerId: true } },
    },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(auth.session.user, pdp.user))) return forbidden();
  if (pdp.status !== "DRAFT" && pdp.status !== "ACTIVE") return badRequest("This PDP can't be edited right now");
  if (!pdp.user.grade) return badRequest("User profile has no grade set");

  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const { title, matrixTopicId } = parsed.data;

  const inputs: PdpGenerationInputs = matrixTopicId
    ? { topicIds: [matrixTopicId], customTopics: [], assessmentId: pdp.assessmentId }
    : { topicIds: [], customTopics: [title], assessmentId: pdp.assessmentId };

  try {
    const topics = await resolveDraftTopics(pdp.user.id, pdp.user.grade, inputs);
    // A matrix topic renamed in the builder keeps its matrix skills but uses the new title.
    const named = topics.length ? [{ ...topics[0], title }] : [{ title, skills: [], priority: true, matrixTopicId: null }];
    const [goal] = await draftGoals(named, { name: pdp.user.name, grade: pdp.user.grade });
    if (!goal) throw new Error("The AI returned nothing for this topic");
    return NextResponse.json({ items: goal.items });
  } catch (e) {
    log.error("PDP goal regeneration failed", { pdpId: pdp.id, error: e instanceof Error ? e.message : String(e) });
    return errorJson("AI_FAILED", "Couldn't generate this topic. Try again in a minute.", 502);
  }
}
