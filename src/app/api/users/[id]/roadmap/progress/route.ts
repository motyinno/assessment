import { NextRequest, NextResponse } from "next/server";
import { requireUserAccess } from "@/lib/auth-helpers";
import { parseJsonBody, serverError } from "@/lib/api-helpers";
import { roadmapProgressSchema } from "@/lib/schemas";
import { buildRoadmap, writeRoadmapProgress } from "@/lib/roadmap";
import type { Grade } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Set a user's per-question roadmap progress. Editable by the user themselves,
 * an admin, or the user's manager (requireUserAccess). Each item carries the
 * full ticked skill set for a (topic, grade); an empty set clears it.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const guard = await requireUserAccess(id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, roadmapProgressSchema);
  if (parsed.error) return parsed.error;

  try {
    await writeRoadmapProgress(
      id,
      parsed.data.items.map((it) => ({
        sectionId: it.sectionId,
        topicId: it.topicId,
        grade: it.grade as Grade,
        resolvedSkills: it.resolvedSkills,
      }))
    );
    const roadmap = await buildRoadmap(id);
    return NextResponse.json(roadmap);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
