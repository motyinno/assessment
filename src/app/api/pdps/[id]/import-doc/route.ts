import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { canComposePdp } from "@/lib/pdp-plan";
import { importPdpFromDoc, PdpImportError } from "@/lib/pdp-doc-import";
import { badRequest, forbidden, notFound } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Drive download + AI extraction.
export const maxDuration = 120;

/**
 * Turn a PDP that was attached by link (content only in the Google Doc) into a
 * structured in-app plan, so it gets progress tracking like any other PDP.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const pdp = await prisma.pdp.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, user: { select: { id: true, managerId: true } } },
  });
  if (!pdp) return notFound("PDP not found");
  if (!(await canComposePdp(me, pdp.user))) return forbidden();
  if (pdp.status !== "ACTIVE" && pdp.status !== "COMPLETED") {
    return badRequest("Only active or completed PDPs can be imported");
  }

  try {
    return NextResponse.json(await importPdpFromDoc(pdp.id, me.id));
  } catch (e) {
    if (e instanceof PdpImportError || e instanceof Error) return badRequest(e.message);
    throw e;
  }
}
