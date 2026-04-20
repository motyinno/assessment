export const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAIN ?? "innowise.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return allowedEmailDomains.includes(domain);
}
