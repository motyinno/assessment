import prisma from "./prisma";

/**
 * Refresh the user's Google access token using the stored refresh token.
 * Updates the user row with the new access token + expiry.
 * Returns null if refresh failed or the user never connected Google.
 */
export async function refreshAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleRefreshToken: true },
  });
  if (!user?.googleRefreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: user.googleRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    console.error("Google token refresh failed:", await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: data.access_token,
      googleTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  });
  return data.access_token;
}

/**
 * Get a valid (non-expired) access token for the user, refreshing if needed.
 * Returns null if the user has never connected Google (e.g. dev-credentials users).
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      googleAccessToken: true,
      googleTokenExpiresAt: true,
      googleRefreshToken: true,
    },
  });
  if (!user?.googleAccessToken) return null;

  if (
    user.googleTokenExpiresAt &&
    user.googleTokenExpiresAt.getTime() - Date.now() < 60_000
  ) {
    return (await refreshAccessToken(userId)) ?? user.googleAccessToken;
  }
  return user.googleAccessToken;
}
