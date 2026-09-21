import prisma from "./prisma";
import { searchDriveFiles } from "./google-drive";
import { fetchConferenceTiming } from "./google-meet";

export interface SyncResult {
  recordingFound?: boolean;
  recordingFileName?: string;
  /** Measured call length in minutes, when Meet had a finished conference. */
  meetDurationMin?: number;
  error?: string;
  status?: number;
}

interface SyncInput {
  assessmentId: string;
  sessionId: string;
  /**
   * Whose Drive we search. For manual refresh this is the actor (the assessor
   * clicking the button). For auto-sync on completion, it's whoever ran the
   * session (session.assessorId).
   */
  actorUserId: string;
}

/**
 * Scan the user's Drive for a recording (mp4/video) matching the session
 * subject's name, and read back from Meet when the call actually ran. Both
 * are persisted on the AssessmentSession row.
 *
 * Idempotent — re-runs are cheap; existing fileIds are kept if the query
 * turns up nothing newer. The two halves are independent on purpose: the
 * conference record is published within moments of the call ending, while the
 * recording can take longer than the meeting itself to appear in Drive, so a
 * sync that finds no recording still nails down the timing.
 */
export async function syncSessionAssets(input: SyncInput): Promise<SyncResult> {
  const sess = await prisma.assessmentSession.findUnique({
    where: { id: input.sessionId },
  });
  if (!sess || sess.assessmentId !== input.assessmentId) {
    return { error: "Session not found", status: 404 };
  }

  const subject = await prisma.assessmentParticipant.findFirst({
    where: {
      assessmentId: sess.assessmentId,
      participantRole: "SUBJECT",
    },
    include: { user: { select: { name: true } } },
  });
  if (!subject?.user) {
    return { error: "Assessment subject not found", status: 400 };
  }

  const subjectTokens = subject.user.name.trim().split(/\s+/);
  const nameContainsClauses = subjectTokens
    .map((t) => `name contains '${t.replace(/'/g, "")}'`)
    .join(" and ");

  const createdAfter = sess.startedAt ?? sess.createdAt;
  const createdAfterIso = createdAfter.toISOString();

  const recordingResult = await fetchRecording(input.actorUserId, {
    nameContainsClauses,
    createdAfterIso,
  });

  if (recordingResult.fileId) {
    await prisma.assessmentSession.update({
      where: { id: sess.id },
      data: {
        recordingFileId: recordingResult.fileId,
        recordingLink: recordingResult.link,
      },
    });
  }

  // A conference that is still running has no endTime yet — leave both
  // columns alone rather than writing a half-measured call, and let the next
  // sync (or the assessor's refresh) pick it up once it's over.
  const timing = await fetchConferenceTiming(
    input.actorUserId,
    sess.meetingLink,
    sess.meetingScheduledAt ?? sess.startedAt
  );
  let meetDurationMin: number | undefined;
  if (timing?.endedAt) {
    await prisma.assessmentSession.update({
      where: { id: sess.id },
      data: {
        meetStartedAt: timing.startedAt,
        meetEndedAt: timing.endedAt,
        // Nothing writes `startedAt` since the Start button was removed, so
        // adopt the call's own start for the rows that have none. Sessions
        // started before that change keep the timestamp they already have.
        ...(sess.startedAt ? {} : { startedAt: timing.startedAt }),
      },
    });
    meetDurationMin = Math.round(
      (timing.endedAt.getTime() - timing.startedAt.getTime()) / 60_000
    );
  }

  return {
    recordingFound: recordingResult.fileId !== null,
    recordingFileName: recordingResult.fileName ?? undefined,
    meetDurationMin,
  };
}

async function fetchRecording(
  userId: string,
  ctx: { nameContainsClauses: string; createdAfterIso: string }
): Promise<{ fileId: string | null; link: string | null; fileName?: string }> {
  // Meet recordings are usually saved to Drive as video/mp4. Sometimes they
  // can appear as other Google-apps video mime types. Cover both.
  const queries = [
    `${ctx.nameContainsClauses} and mimeType = 'video/mp4' and trashed = false and modifiedTime > '${ctx.createdAfterIso}'`,
    `${ctx.nameContainsClauses} and mimeType contains 'video/' and trashed = false and modifiedTime > '${ctx.createdAfterIso}'`,
  ];
  for (const q of queries) {
    const files = await searchDriveFiles(userId, q);
    if (files && files.length > 0) {
      const candidate = files[0];
      return {
        fileId: candidate.id,
        link: candidate.webViewLink ?? null,
        fileName: candidate.name,
      };
    }
  }
  return { fileId: null, link: null };
}
