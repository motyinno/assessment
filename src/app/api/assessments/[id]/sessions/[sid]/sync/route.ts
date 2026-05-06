import { NextRequest, NextResponse } from "next/server";
import { syncSessionAssets } from "@/lib/session-sync";
import { requireAssessmentAssessor } from "@/lib/auth-helpers";

/**
 * POST /api/assessments/[id]/sessions/[sid]/sync
 * Manually re-scans the caller's Google Drive for the session recording.
 * Caller must be an assessor on this specific assessment.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { id, sid } = await params;
  const guard = await requireAssessmentAssessor(id);
  if (guard.error) return guard.error;

  const result = await syncSessionAssets({
    assessmentId: id,
    sessionId: sid,
    actorUserId: guard.session.user.id,
  });

  if (result.error) {
    return NextResponse.json(
      { error: { code: "SYNC_ERROR", message: result.error } },
      { status: result.status ?? 500 }
    );
  }
  return NextResponse.json(result);
}
