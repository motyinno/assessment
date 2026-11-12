import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertCanEditDivision, resolveEditableDivision } from "@/lib/user-division";
import { notFound, parseJsonBody } from "@/lib/api-helpers";
import { BANDS, acceptSuggestedSkill, dismissSuggestedSkill, suggestedSkills } from "@/lib/question-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skills clients ask about that the topics don't list yet. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const division = await resolveEditableDivision(auth.session.user, new URL(req.url).searchParams.get("departmentId"));
  if (division.error) return division.error;
  return NextResponse.json({ topics: await suggestedSkills(division.departmentId) });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("accept"),
    topicId: z.string().min(1),
    proposed: z.string().trim().min(1).max(120),
    skill: z.string().trim().min(1).max(200),
    band: z.enum(BANDS),
  }),
  z.object({ action: z.literal("dismiss"), topicId: z.string().min(1), proposed: z.string().trim().min(1).max(120) }),
]);

/** Accept (adds the skill to the topic at a band) or dismiss a suggestion. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = await parseJsonBody(req, actionSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;
  const topic = await prisma.matrixTopic.findUnique({ where: { id: body.topicId }, include: { section: { select: { departmentId: true } } } });
  if (!topic) return notFound("Topic not found");
  const scope = await assertCanEditDivision(auth.session.user, topic.section.departmentId);
  if (scope) return scope;
  if (body.action === "accept") await acceptSuggestedSkill(body.topicId, body.band, body.skill, body.proposed);
  else await dismissSuggestedSkill(body.topicId, body.proposed);
  return NextResponse.json({ ok: true });
}
