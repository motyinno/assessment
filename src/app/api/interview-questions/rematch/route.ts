import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { badRequest, conflict } from "@/lib/api-helpers";
import { RematchError, startRematch } from "@/lib/question-bank";

export const runtime = "nodejs";

const bodySchema = z.object({
  departmentId: z.string().nullish(),
  /** Topics to find questions for; empty = re-match the unattached questions. */
  topicIds: z.array(z.string().min(1).max(200)).max(50).default([]),
});

/** Start an AI re-match of the division's questions against its current matrix. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request", parsed.error.issues.map((i) => i.message));
  const division = await resolveEditableDivision(auth.session.user, parsed.data.departmentId);
  if (division.error) return division.error;
  try {
    const job = await startRematch({ departmentId: division.departmentId, targetTopicIds: parsed.data.topicIds, createdById: auth.session.user.id });
    return NextResponse.json(job, { status: 201 });
  } catch (e) {
    if (e instanceof RematchError) return conflict(e.message);
    throw e;
  }
}
