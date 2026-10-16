import { NextRequest, NextResponse } from "next/server";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { conflict } from "@/lib/api-helpers";
import { publishSource } from "@/lib/market-signals";

export const runtime = "nodejs";

/**
 * Publish a reviewed source: it becomes a PDP basis for its division and the
 * previously published report of that division is archived.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  if (g.source.status !== "IN_REVIEW" && g.source.status !== "ARCHIVED") {
    return conflict(
      g.source.status === "PUBLISHED" ? "Already published" : "Only a reviewed source can be published — wait for processing to finish"
    );
  }
  await publishSource(params.id);
  return NextResponse.json({ ok: true });
}
