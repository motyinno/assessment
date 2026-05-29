import crypto from "node:crypto";
import { headers } from "next/headers";
import type { Session } from "next-auth";
import prisma from "@/lib/prisma";

const TOKEN_PREFIX = "pdp_";

export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const hash = hashToken(token);
  const prefix = token.slice(0, 12);
  return { token, hash, prefix };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Build a NextAuth-compatible Session from an API token presented in the
 * `Authorization: Bearer ...` header. Returns null if no token is present or
 * the token is invalid/expired/revoked.
 */
export async function sessionFromBearerToken(): Promise<Session | null> {
  const h = await headers();
  const auth = h.get("authorization") ?? h.get("Authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = hashToken(token);
  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          grade: true,
          project: true,
          managerId: true,
        },
      },
    },
  });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() < Date.now()) return null;

  // Fire-and-forget lastUsedAt update; don't block the request.
  prisma.apiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const u = record.user;
  const session: Session = {
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      grade: u.grade ?? null,
      project: u.project ?? null,
      managerId: u.managerId ?? null,
    } as Session["user"],
    expires: record.expiresAt
      ? record.expiresAt.toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(),
  };
  return session;
}
