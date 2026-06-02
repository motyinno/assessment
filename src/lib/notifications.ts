import prisma from "@/lib/prisma";
import { log } from "@/lib/api-helpers";
import { sendEmail, appBaseUrl } from "@/lib/email";
import type { NotificationType } from "@prisma/client";

type Recipient = { id: string; name: string; email: string };

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
export async function notifyAdminsOfNewRequest(requesterName: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true },
  });
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
  assessmentId: string
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
}
