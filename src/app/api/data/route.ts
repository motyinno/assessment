import { NextResponse } from "next/server";
import {
  loadPdpTopicsMarkdown,
  listAvailableGrades,
  loadMapping,
} from "@/lib/data-loader";
import { parsePdpTopicsMd } from "@/lib/pdp-topics-parser";

export const runtime = "nodejs";

/**
 * GET /api/data
 * Returns pre-loaded PDP topics count, available grades,
 * and mapping keys per grade (for the searchable topic selector).
 */
export async function GET() {
  try {
    const md = loadPdpTopicsMarkdown();
    const topics = parsePdpTopicsMd(md);
    const grades = listAvailableGrades();

    // Build mapping keys per grade for the manual topic selector
    const mappingKeys: Record<string, string[]> = {};
    for (const grade of grades) {
      const mapping = loadMapping(grade as "jun" | "mid");
      mappingKeys[grade] = Object.keys(mapping);
    }

    return NextResponse.json({
      pdpTopicsCount: Object.keys(topics).length,
      availableGrades: grades,
      mappingKeys,
      templateLoaded: true,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
