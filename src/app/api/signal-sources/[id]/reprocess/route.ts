import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSourceAdmin } from "@/lib/signal-source-guard";
import { conflict, parseJsonBody } from "@/lib/api-helpers";
import { restartSourceProcessing } from "@/lib/market-signals";

export const runtime = "nodejs";

const bodySchema = z.object({ step: z.enum(["extract", "map"]).default("map") });

/**
 * Re-run extraction (HTML/text sources: the AI reads the stored input again,
 * replacing the signals and any admin mapping) or just the mapping (keeps
 * mappings an admin set by hand).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await requireSourceAdmin(params.id);
  if (g.error) return g.error;
  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  if (g.source.status === "PUBLISHED") return conflict("Published sources are frozen — upload a new one instead");
  const extract = parsed.data.step === "extract";
  if (extract && g.source.format === "json") return conflict("A JSON report is imported as-is; there is nothing to extract");

  await restartSourceProcessing(params.id, { extract });
  return NextResponse.json({ ok: true }, { status: 202 });
}
