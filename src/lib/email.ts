import { Resend } from "resend";
import { log } from "@/lib/api-helpers";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "Node Assessment <onboarding@resend.dev>";

// Lazily instantiated so the app boots fine without a key (email just no-ops).
const resend = apiKey ? new Resend(apiKey) : null;

/** Absolute base URL used to turn relative in-app links into clickable links. */
export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Best-effort transactional email. Never throws: a mail failure must not break
 * the request that triggered it. Returns true when the provider accepted it.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<boolean> {
  if (!resend) {
    log.warn("email skipped: RESEND_API_KEY not set", { to, subject });
    return false;
  }
  try {
    const { error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) {
      log.error("email send failed", { to, subject, error: error.message });
      return false;
    }
    return true;
  } catch (e) {
    log.error("email send threw", {
      to,
      subject,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
