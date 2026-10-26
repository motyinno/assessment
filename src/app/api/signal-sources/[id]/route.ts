import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { serializeSource } from "@/lib/market-signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A source with its signals and their mapping (the review screen). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  return NextResponse.json(await serializeSource(g.source));
}

/**
 * Delete a source. Plans already built on it keep their stored basis label
 * and per-goal reasons; only the signal rows go.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  await prisma.signalSource.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
