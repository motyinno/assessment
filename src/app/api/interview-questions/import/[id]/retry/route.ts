import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertCanEditDivision } from "@/lib/user-division";
import { conflict, notFound } from "@/lib/api-helpers";
import { runImportMapping } from "@/lib/question-bank";

export const runtime = "nodejs";

/** Restart AI mapping of an import's still-pending questions (after a failure or a server restart). */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const batch = await prisma.interviewQuestionImport.findUnique({ where: { id: params.id } });
  if (!batch) return notFound("Import not found");
  const scope = await assertCanEditDivision(auth.session.user, batch.departmentId);
  if (scope) return scope;
  const pending = await prisma.interviewQuestion.count({ where: { importId: batch.id, OR: [{ pendingTopic: true }, { pendingKind: true }] } });
  if (!pending) return conflict("Nothing left to map in this import");
  await prisma.interviewQuestionImport.update({
    where: { id: batch.id },
    data: { status: "PROCESSING", error: null, mapTotal: batch.mapDone + pending },
  });
  void runImportMapping(batch.id);
  return NextResponse.json({ ok: true, pending }, { status: 202 });
}
