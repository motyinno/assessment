/**
 * Absolute base URL of the app, used to turn relative in-app links into
 * clickable absolute links (e.g. in Google Chat messages). Trailing slash
 * stripped so callers can safely append a path.
 */
export function appBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}
