/**
 * Certificate code handling.
 *
 * A certificate is stored as its bare code (e.g. "5Y0FT4E8X7GG9F6T"). The
 * public verification link is derived from the code so we never persist the
 * full URL. Codes are normalized to uppercase and validated as alphanumeric.
 */

/** Base of the public verification URL; the code is appended verbatim. */
export const CERT_VERIFY_BASE_URL = "https://cert.inno.ws/verify/";

/**
 * Public verification API the cert.inno.ws SPA calls. Returns 200 + JSON for a
 * real code and 404 for an unknown one. Overridable via env for staging.
 */
export const CERT_VERIFY_API_URL =
  process.env.CERT_VERIFY_API_URL ?? "https://cert.inno.ws/api/verify/";

/** Build the verification link for a certificate code. */
export function certVerifyUrl(code: string): string {
  return `${CERT_VERIFY_BASE_URL}${code}`;
}

/** Shape returned by the verification API for a known certificate. */
export interface CertVerification {
  verificationCode: string;
  status: string;
  employeeName: string | null;
  division: string | null;
  position: string | null;
  category: string | null;
  dateIssued: string | null;
  expirationDate: string | null;
  issuedBy: string | null;
}

export type VerifyResult =
  | { ok: true; data: CertVerification }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "unavailable" };

/**
 * Check a certificate code against the public verification API.
 * - 200 → exists (`ok: true`)
 * - 404 → does not exist (`reason: "not_found"`)
 * - timeout / network / other status → can't tell (`reason: "unavailable"`)
 */
export async function verifyCertificateExists(
  code: string
): Promise<VerifyResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `${CERT_VERIFY_API_URL}${encodeURIComponent(code)}`,
      { signal: controller.signal, headers: { Accept: "application/json" } }
    );
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const data = (await res.json()) as CertVerification;
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalize a user-entered code: trim surrounding whitespace and uppercase.
 * Accepts a pasted verification URL too, extracting the trailing code.
 */
export function normalizeCertCode(input: string): string {
  let code = input.trim();
  const slash = code.lastIndexOf("/");
  if (slash !== -1) code = code.slice(slash + 1);
  return code.toUpperCase();
}
