import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertCanEditDivision } from "@/lib/user-division";
import { badRequest, conflict, notFound, parseJsonBody } from "@/lib/api-helpers";
import { BANDS, KINDS, divisionTopicIds, normalizeQuestion } from "@/lib/question-bank";

export const runtime = "nodejs";

const patchSchema = z.object({
  text: z.string().trim().min(3).max(500).optional(),
  kind: z.enum(KINDS).optional(),
  topicId: z.string().min(1).nullable().optional(),
  band: z.enum(BANDS).nullable().optional(),
  hidden: z.boolean().optional(),
});

async function load(id: string, user: Parameters<typeof assertCanEditDivision>[0]) {
  const q = await prisma.interviewQuestion.findUnique({ where: { id } });
  if (!q) return { error: notFound("Question not found"), q: null };
  const scope = await assertCanEditDivision(user, q.departmentId);
  if (scope) return { error: scope, q: null };
  return { error: null, q };
}

/** Re-attach, re-level, reword or hide a question. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { error, q } = await load(params.id, auth.session.user);
  if (error) return error;
  const parsed = await parseJsonBody(req, patchSchema);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (body.topicId && !(await divisionTopicIds(q.departmentId)).has(body.topicId)) {
    return badRequest("That topic isn't in this division's matrix");
  }
  let normalized: string | undefined;
  if (body.text && body.text !== q.text) {
    normalized = normalizeQuestion(body.text);
    const dup = await prisma.interviewQuestion.findFirst({
      where: { departmentId: q.departmentId, normalized, id: { not: q.id } },
      select: { id: true },
    });
    if (dup) return conflict("Another question already has this wording");
  }
  const updated = await prisma.interviewQuestion.update({
    where: { id: q.id },
    data: {
      ...(body.text ? { text: body.text, normalized } : {}),
      ...(body.kind ? { kind: body.kind } : {}),
      // Another topic means other skills: the old skill mapping no longer applies.
      ...(body.topicId !== undefined && body.topicId !== q.topicId
        ? { topicId: body.topicId, skill: null, proposedSkill: null, ...(body.topicId ? { proposedTopic: null } : {}) }
        : {}),
      ...(body.band !== undefined ? { band: body.band } : {}),
      ...(body.hidden !== undefined ? { hidden: body.hidden } : {}),
    },
    select: { id: true, text: true, kind: true, band: true, topicId: true, proposedTopic: true, timesAsked: true, hidden: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { error, q } = await load(params.id, auth.session.user);
  if (error) return error;
  await prisma.interviewQuestion.delete({ where: { id: q.id } });
  return new NextResponse(null, { status: 204 });
}
