import { NextResponse } from "next/server";
import {
  loadPdpTopicsMarkdown,
  listAvailableGrades,
  loadMapping,
} from "@/lib/data-loader";
import { parsePdpTopicsMd } from "@/lib/pdp-topics-parser";
import { requireAuth } from "@/lib/auth-helpers";
import { serverError } from "@/lib/api-helpers";

export const runtime = "nodejs";
// File-based reference data only changes on deploy, so cache the response in
// the route handler for an hour. Removes the per-page-load file I/O hit.
export const revalidate = 3600;

/**
 * GET /api/data
 * Returns pre-loaded PDP topics count, available grades, and mapping keys
 * per grade (used by the topic-selector UI). Auth required so we don't leak
 * grade taxonomy publicly.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const md = loadPdpTopicsMarkdown();
    const topics = parsePdpTopicsMd(md);
    const grades = listAvailableGrades();

    const mappingKeys: Record<string, string[]> = {};
    for (const grade of grades) {
      const mapping = loadMapping(grade as "jun" | "mid");
      mappingKeys[grade] = Object.keys(mapping);
    }

    return NextResponse.json(
      {
        pdpTopicsCount: Object.keys(topics).length,
        availableGrades: grades,
        mappingKeys,
        templateLoaded: true,
      },
      {
        headers: {
          // Browsers + CDNs can also cache for an hour; the data only changes
          // when the deployed image changes.
          "Cache-Control": "private, max-age=3600",
        },
      }
    );
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
