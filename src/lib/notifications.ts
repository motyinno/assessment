import prisma from "@/lib/prisma";
import { getAdminsResponsibleFor, getSuperAdmins } from "@/lib/admin-scope";
import { log } from "@/lib/api-helpers";
import { appBaseUrl } from "@/lib/email";
import {
  chatEnabled,
  createSpace,
  addMembers,
  postMessage,
  mention,
  ensureGoogleIds,
} from "@/lib/google-chat";
import { gradeLabel } from "@/lib/grades";
import type { HrmSyncRun, NotificationType } from "@prisma/client";

/** Absolute link to an in-app path, for clickable Chat messages. */
function chatLink(path: string): string {
  return `${appBaseUrl()}${path}`;
}

type Recipient = { id: string; name: string; email: string };
type Admin = Recipient & { googleId: string | null };

/** Admins receive both the review queue and the request queue notifications. */
async function getAdmins(): Promise<Admin[]> {
  return prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, googleId: true },
  });
}

type NotifyArgs = {
  recipient: Recipient;
  type: NotificationType;
  title: string;
  body?: string;
  /** Relative in-app link, e.g. "/assessments/abc". */
  link?: string;
};

/**
 * Create one in-app notification (shown in the bell). Best-effort — never
 * throws, so a failure here can't break the triggering request. Email delivery
 * was intentionally dropped; notifications go to the in-app bell + Google Chat.
 */
async function notify({ recipient, type, title, body, link }: NotifyArgs): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId: recipient.id, type, title, body: body ?? null, link: link ?? null },
    });
  } catch (e) {
    log.error("notification db write failed", {
      userId: recipient.id,
      type,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ---- Event-level helpers -------------------------------------------------

/** A user submitted an assessment request -> notify the admins responsible for them. */
export async function notifyAdminsOfNewRequest(params: {
  requestId: string;
  requesterId: string;
  requesterName: string;
  grade: string;
}): Promise<void> {
  const { requestId, requesterId, requesterName, grade } = params;
  // The requester's own admins, not every admin in the company — see
  // getAdminsResponsibleFor. This same list becomes the Chat space's member
  // list below, so the in-app audience and the room can't drift apart.
  const admins = await getAdminsResponsibleFor(requesterId);
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipient: admin,
        type: "REQUEST_SUBMITTED",
        title: "New assessment request",
        body: `${requesterName} requested an assessment. Review it and assign assessors.`,
        link: "/requests",
      })
    )
  );

  // Google Chat: open the per-assessment thread authored by the requester and
  // @mention the admins so they get a push. The space id is persisted on the
  // request and reused for the assign + review-submitted stages.
  await chatOpenRequestThread({ requestId, requesterId, requesterName, grade, admins });
}

async function chatOpenRequestThread(params: {
  requestId: string;
  requesterId: string;
  requesterName: string;
  grade: string;
  admins: Admin[];
}): Promise<void> {
  if (!chatEnabled()) return;
  const { requestId, requesterId, requesterName, grade, admins } = params;
  try {
    const space = await createSpace(requesterId, `Assessment: ${requesterName}`);
    if (!space) return;
    await prisma.assessmentRequest.update({
      where: { id: requestId },
      data: { chatSpaceName: space },
    });
    // Resolve any admins missing a googleId via the directory so everyone gets
    // a real @mention, not just those who have signed in.
    const ids = await ensureGoogleIds(requesterId, admins);
    await addMembers(
      requesterId,
      space,
      admins.map((a) => ids.get(a.id))
    );
    const tags = admins.map((a) => mention(ids.get(a.id), a.name)).join(", ");
    await postMessage(
      requesterId,
      space,
      `Hi ${tags} 👋\n\n` +
        `${requesterName} has requested an assessment (grade: ${gradeLabel(grade)}). ` +
        `Please review the request and assign assessors when you get a chance:\n` +
        `${chatLink("/requests")}\n\n` +
        `Thanks! 🙌`
    );
  } catch (e) {
    log.error("chat: open request thread failed", {
      requestId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Request approved -> notify the requester. */
export async function notifyRequestApproved(
  requester: Recipient,
  assessmentId: string
): Promise<void> {
  await notify({
    recipient: requester,
    type: "REQUEST_APPROVED",
    title: "Your assessment request was approved",
    body: "Your assessment has been created. Open it to see your sessions and assessors.",
    link: `/assessments/${assessmentId}`,
  });
}

/** Request rejected -> notify the requester (include the admin's comment). */
export async function notifyRequestRejected(
  requester: Recipient,
  adminNotes: string
): Promise<void> {
  await notify({
    recipient: requester,
    type: "REQUEST_REJECTED",
    title: "Your assessment request was declined",
    body: adminNotes
      ? `Reason: ${adminNotes}`
      : "An administrator declined your assessment request.",
    link: "/request-assessment",
  });
}

/** An assessor was assigned to an assessment -> notify each one. */
export async function notifyAssessorsAssigned(
  assessors: Recipient[],
  subjectName: string,
  assessmentId: string,
  chat?: { actingUserId: string; space: string | null; grade: string }
): Promise<void> {
  await Promise.all(
    assessors.map((assessor) =>
      notify({
        recipient: assessor,
        type: "ASSESSMENT_ASSIGNED",
        title: "You were assigned to an assessment",
        body: `You'll be assessing ${subjectName}. Open the assessment to see the details.`,
        link: `/assessments/${assessmentId}`,
      })
    )
  );

  // Google Chat: the approving admin adds the assessors to the existing thread
  // and @mentions them.
  if (chat?.space && chatEnabled()) {
    await chatNotifyAssessorsAssigned(
      chat.actingUserId,
      chat.space,
      assessors,
      subjectName,
      chat.grade,
      assessmentId
    );
  }
}

async function chatNotifyAssessorsAssigned(
  actingUserId: string,
  space: string,
  assessors: Recipient[],
  subjectName: string,
  grade: string,
  assessmentId: string
): Promise<void> {
  try {
    // `assessors` carries no googleId; look them up (and resolve any missing id
    // via the directory) so we can add + mention them even if they never signed in.
    const rows = await prisma.user.findMany({
      where: { id: { in: assessors.map((a) => a.id) } },
      select: { id: true, email: true, googleId: true },
    });
    const googleIdById = await ensureGoogleIds(actingUserId, rows);
    await addMembers(
      actingUserId,
      space,
      rows.map((r) => googleIdById.get(r.id))
    );
    const tags = assessors
      .map((a) => mention(googleIdById.get(a.id), a.name))
      .join(", ");
    await postMessage(
      actingUserId,
      space,
      `Hi ${tags} 👋\n\n` +
        `You've been assigned to assess ${subjectName} (grade: ${gradeLabel(grade)}). ` +
        `Open the assessment to see the schedule and details:\n` +
        `${chatLink(`/assessments/${assessmentId}`)}\n\n` +
        `Good luck! 🚀`
    );
  } catch (e) {
    log.error("chat: assessors-assigned post failed", {
      space,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * An assessor finished an assessment and submitted it for grade review ->
 * notify the subject's admins (in-app) and @mention them in the Chat thread,
 * authored by the assessor.
 */
export async function notifyAdminsReviewSubmitted(params: {
  actingUserId: string;
  actingUserName: string;
  /** The person being assessed — whose admins are the audience, not the assessor's. */
  subjectUserId: string | null;
  subjectName: string;
  assessmentId: string;
  space: string | null;
}): Promise<void> {
  const { actingUserId, actingUserName, subjectUserId, subjectName, assessmentId, space } = params;
  // Scoped to the SUBJECT: it's their grade under review, and it keeps this
  // audience identical to the one the request thread was opened with.
  // No subject on the assessment is a data anomaly, not a reason to tell the
  // whole company — that's the super-admins' business.
  const admins = subjectUserId ? await getAdminsResponsibleFor(subjectUserId) : await getSuperAdmins();
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipient: admin,
        type: "ASSESSMENT_REVIEW_SUBMITTED",
        title: "Assessment ready for grade review",
        body: `${actingUserName} finished assessing ${subjectName} and submitted it for grade review.`,
        link: "/assessment-review",
      })
    )
  );

  if (space && chatEnabled()) {
    try {
      const ids = await ensureGoogleIds(actingUserId, admins);
      const tags = admins.map((a) => mention(ids.get(a.id), a.name)).join(", ");
      await postMessage(
        actingUserId,
        space,
        `Hi ${tags} 👋\n\n` +
          `${actingUserName} has finished the assessment of ${subjectName} and left feedback. ` +
          `The grade is ready for your review:\n` +
          `${chatLink("/assessment-review")}\n\n` +
          `Thanks! ✅`
      );
    } catch (e) {
      log.error("chat: review-submitted post failed", {
        space,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Nightly HRM sync aborted/failed (S04) -> notify every admin. No Chat
 * counterpart here: the sync runs as a technical user with no acting human
 * whose OAuth token could post the message (see S04 plan's "Alerts" — Chat
 * for HRM alerts is a separate, explicitly-opt-in path via
 * `HRM_ALERT_CHAT_ACTOR_EMAIL`, not this function).
 */
export async function notifyAdminsOfHrmSyncFailure(run: HrmSyncRun): Promise<void> {
  const admins = await getAdmins();
  const title =
    run.status === "ABORTED_GUARD" ? "HRM sync aborted by a guard" : "HRM sync failed";
  const body = run.failureReason ?? "See the sync run log for details.";
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipient: admin,
        type: "HRM_SYNC_FAILED",
        title,
        body,
        link: "/admin/hrm-sync",
      })
    )
  );
}

/**
 * Nightly HRM sync (S05) auto-granted ADMIN to one or more people -> notify
 * every admin. Same pattern as `notifyAdminsOfHrmSyncFailure` — best-effort,
 * no Chat counterpart (the sync has no acting human).
 */
export async function notifyAdminsOfHrmRoleGrants(params: {
  runId: string;
  adminsGranted: number;
}): Promise<void> {
  const { runId, adminsGranted } = params;
  const admins = await getAdmins();
  const body =
    adminsGranted === 1
      ? `HRM sync auto-granted ADMIN to 1 person (run ${runId}). Review the sync run log for details.`
      : `HRM sync auto-granted ADMIN to ${adminsGranted} people (run ${runId}). Review the sync run log for details.`;
  await Promise.all(
    admins.map((admin) =>
      notify({
        recipient: admin,
        type: "HRM_ROLE_GRANTED",
        title: "HRM sync granted ADMIN access",
        body,
        link: "/admin/hrm-sync",
      })
    )
  );
}
