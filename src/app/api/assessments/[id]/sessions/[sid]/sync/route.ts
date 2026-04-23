import { NextRequest, NextResponse } from "next/server";
import { syncSessionAssets } from "@/lib/session-sync";
import { requireAssessor } from "@/lib/auth-helpers";

/**
 * POST /api/assessments/[id]/sessions/[sid]/sync
 *
 * Scans the assessor's Google Drive for a recording file matching this
 * session and saves it to the session row.
 *
 * Call this after the meeting ends — Google publishes recordings
 * asynchronously (typically within 1–5 minutes after the call). The server
 * also triggers this automatically (with a delay) when a session is marked
 * COMPLETED; this endpoint is the manual retry.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { error, session: authSession } = await requireAssessor();
  if (error) return error;

  const { id, sid } = await params;

  const result = await syncSessionAssets({
    assessmentId: id,
    sessionId: sid,
    actorUserId: authSession.user.id,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return NextResponse.json(result);
}
