import type { NextAuthConfig } from "next-auth";

/**
 * The EDGE-SAFE half of the Auth.js config — no Prisma, no Node-only imports,
 * nothing that reaches the database.
 *
 * It exists because `src/middleware.ts` runs on the edge runtime, and
 * `middleware` wrapping the full `auth()` made Auth.js run the `jwt` callback
 * there. That callback refreshes the token from the database every 10 minutes
 * (see `auth.ts`), so ten minutes after signing in every request threw
 *
 *   JWTSessionError: PrismaClientValidationError: In order to run Prisma
 *   Client on edge runtime, either: Use Prisma Accelerate / Driver Adapters
 *
 * Auth.js treats a throwing `jwt` callback as an unreadable session, so
 * `req.auth` came back null and the middleware redirected to /login — the
 * "logged out after a few minutes" symptom. It only ever bit an established
 * session, which is why it looked intermittent: while the token was fresher
 * than 10 minutes the callback never reached Prisma at all.
 *
 * The middleware builds its own `NextAuth(authConfig)` from this file. It only
 * needs to decode the cookie and read the claims, which is exactly what is left
 * here. Token refresh still happens on every Node-runtime `auth()` — server
 * components and route handlers — so archive enforcement and role changes keep
 * landing within the same 10 minutes as before.
 *
 * `providers` is deliberately empty: the middleware never runs a provider's
 * `authorize`, and this project's Credentials provider queries Prisma.
 */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * Pure token -> session projection. Safe on the edge and needed there: the
     * middleware reads `req.auth.user.isArchived` to bounce archived people.
     */
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as typeof session.user & {
          id: string;
          role: string;
          isSuperAdmin: boolean;
          grade: string | null;
          project: string | null;
          managerId: string | null;
          isArchived: boolean;
          photoFileName: string | null;
        };
        u.id = token.id as string;
        u.role = token.role as string;
        u.isSuperAdmin = (token.isSuperAdmin ?? false) as boolean;
        u.grade = (token.grade ?? null) as string | null;
        u.project = (token.project ?? null) as string | null;
        u.managerId = (token.managerId ?? null) as string | null;
        u.isArchived = (token.isArchived ?? false) as boolean;
        u.photoFileName = (token.photoFileName ?? null) as string | null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
