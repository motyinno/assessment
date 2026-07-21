import prisma from "@/lib/prisma";
import { log } from "@/lib/api-helpers";
import { sendEmail, appBaseUrl } from "@/lib/email";
import {
  chatEnabled,
  createSpace,
  addMembers,
  postMessage,
  mention,
} from "@/lib/google-chat";
import { gradeLabel } from "@/lib/grades";
import type { NotificationType } from "@prisma/client";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailHtml(title: string, body: string | undefined, ctaUrl: string | null): string {
  const cta = ctaUrl
    ? `<p style="margin:24px 0 0"><a href="${ctaUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open in Node Assessment</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#111">
  <h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(title)}</h2>
  ${body ? `<p style="font-size:14px;line-height:1.5;color:#374151;margin:0">${escapeHtml(body)}</p>` : ""}
  ${cta}
  <p style="font-size:12px;color:#9ca3af;margin:28px 0 0">Node Assessment — Assessments & PDPs</p>
</div>`;
}

/**
 * Create one in-app notification and mirror it to email (best-effort).
 * Never throws — a failure here must not break the triggering request.
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

  const ctaUrl = link ? `${appBaseUrl()}${link}` : null;
  await sendEmail({
    to: recipient.email,
    subject: title,
    html: emailHtml(title, body, ctaUrl),
    text: body ? `${title}\n\n${body}${ctaUrl ? `\n\n${ctaUrl}` : ""}` : title,
  });
}

// ---- Event-level helpers -------------------------------------------------

/** A user submitted an assessment request -> notify every admin. */
export async function notifyAdminsOfNewRequest(params: {
  requestId: string;
  requesterId: string;
  requesterName: string;
  grade: string;
}): Promise<void> {
  const { requestId, requesterId, requesterName, grade } = params;
  const admins = await getAdmins();
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
    await addMembers(
      requesterId,
      space,
      admins.map((a) => a.googleId)
    );
    const tags = admins.map((a) => mention(a.googleId, a.name)).join(", ");
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
    // `assessors` carries no googleId; look them up so we can add + mention them.
    const rows = await prisma.user.findMany({
      where: { id: { in: assessors.map((a) => a.id) } },
      select: { id: true, name: true, googleId: true },
    });
    const googleIdById = new Map(rows.map((r) => [r.id, r.googleId]));
    await addMembers(
      actingUserId,
      space,
      rows.map((r) => r.googleId)
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
 * notify every admin (in-app + email) and @mention them in the Chat thread,
 * authored by the assessor.
 */
export async function notifyAdminsReviewSubmitted(params: {
  actingUserId: string;
  actingUserName: string;
  subjectName: string;
  assessmentId: string;
  space: string | null;
}): Promise<void> {
  const { actingUserId, actingUserName, subjectName, assessmentId, space } = params;
  const admins = await getAdmins();
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
      const tags = admins.map((a) => mention(a.googleId, a.name)).join(", ");
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
