import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertCanEditDivision } from "@/lib/user-division";
import { conflict, notFound } from "@/lib/api-helpers";
import { RematchError, undoRematch } from "@/lib/question-bank";

export const runtime = "nodejs";

/** Move the questions a re-match moved back to where they were. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const job = await prisma.interviewQuestionImport.findUnique({ where: { id: params.id }, select: { departmentId: true } });
  if (!job) return notFound("Re-match not found");
  const scope = await assertCanEditDivision(auth.session.user, job.departmentId);
  if (scope) return scope;
  try {
    return NextResponse.json({ restored: await undoRematch(params.id) });
  } catch (e) {
    if (e instanceof RematchError) return conflict(e.message);
    throw e;
  }
}
