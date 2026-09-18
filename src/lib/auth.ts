import NextAuth, { type NextAuthConfig } from "next-auth";
import { authConfig } from "./auth.config";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import prisma from "./prisma";
import { isEmailAllowed } from "./allowed-domains";
import { refreshEmployeeByEmail } from "@/lib/hrm/refresh-user";
import { log } from "@/lib/logger";

type Provider = NonNullable<NextAuthConfig["providers"]>[number];

const isProd = process.env.NODE_ENV === "production";
const devLoginEnabled =
  process.env.ENABLE_DEV_LOGIN === "true" && !isProd;
const devPassword = process.env.DEV_LOGIN_PASSWORD;

if (devLoginEnabled && (!devPassword || devPassword.length < 8)) {
  // Fail loudly at startup rather than silently accepting a 3-char password.
  throw new Error(
    "ENABLE_DEV_LOGIN=true but DEV_LOGIN_PASSWORD is missing or shorter than 8 characters. Set a strong password or remove ENABLE_DEV_LOGIN."
  );
}

// Scopes needed for Drive file upload + Calendar event creation with Meet.
// `drive` (full) is required — `drive.file` only sees files the app itself created.
// `calendar.events` is needed to create events + embedded Meet links on behalf of
// the signed-in assessor. The `chat.*` scopes let us post assessment-lifecycle
// notifications into a Google Chat space *authored by the acting user* (see
// lib/google-chat.ts): create the space, add members, and send messages.
// Users must re-authorize when the scope list changes.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/chat.spaces.create",
  "https://www.googleapis.com/auth/chat.memberships",
  "https://www.googleapis.com/auth/chat.messages.create",
  // Resolve a colleague's Google account id from the Workspace directory by
  // email (People API) so we can @mention/add people who never signed in.
  "https://www.googleapis.com/auth/directory.readonly",
  // Pre-configure auto recording on the Meet space attached to the event we
  // just created in Calendar (see lib/google-meet.ts). Non-sensitive scope,
  // and the only one that works on spaces another app created.
  "https://www.googleapis.com/auth/meetings.space.settings",
  // Read the conference record afterwards — when the call actually started
  // and ended. The settings scope above does NOT grant this one.
  "https://www.googleapis.com/auth/meetings.space.readonly",
].join(" ");

const providers: Provider[] = [
  Google({
    authorization: {
      params: {
        prompt: "consent",
        access_type: "offline",
        response_type: "code",
        scope: GOOGLE_SCOPES,
      },
    },
  }),
];

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-credentials",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = (creds?.email as string | undefined)?.toLowerCase().trim();
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;
        if (password !== devPassword) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.isArchived) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

/**
 * The FULL config: the edge-safe half (auth.config.ts) plus everything that
 * needs the database — the providers and the `signIn`/`jwt` callbacks. Used by
 * the route handlers and by every server-side `auth()` call, all of which run
 * on the Node runtime. `src/middleware.ts` must NOT import this: see the note
 * at the top of auth.config.ts for what happens when Prisma reaches the edge.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ account, profile }) {
      // Dev credentials bypass the domain allowlist (already verified in authorize())
      if (account?.provider === "dev-credentials") return true;

      if (!isEmailAllowed(profile?.email)) return false;

      const email = profile!.email as string;
      const name = (profile?.name as string | undefined) ?? email.split("@")[0];

      // Persist Google tokens for later Drive API calls, plus the account id
      // (`sub`) which Google Chat needs to @mention / add the user in a space.
      const tokenData: {
        googleId?: string;
        googleAccessToken?: string;
        googleRefreshToken?: string;
        googleTokenExpiresAt?: Date;
      } = {};
      if (account?.provider === "google") {
        if (account.providerAccountId) tokenData.googleId = account.providerAccountId;
        if (account.access_token) tokenData.googleAccessToken = account.access_token;
        if (account.refresh_token) tokenData.googleRefreshToken = account.refresh_token;
        if (account.expires_at) {
          tokenData.googleTokenExpiresAt = new Date(account.expires_at * 1000);
        }
      }

      const dbUser = await prisma.user.upsert({
        where: { email },
        // `name` is deliberately not in `update`: after the HRM integration,
        // `name` is an HRM-owned field (see hrm/apply-user.ts) — a Google
        // login must not overwrite it with whatever the person's Google
        // account happens to display.
        update: { ...tokenData },
        create: { email, name, role: "USER", ...tokenData },
      });

      // Best-effort refresh from HRM so a new hire who signs in before the
      // first nightly sync still gets their grade/department/job title.
      // Never blocks sign-in: refreshEmployeeByEmail() already swallows its
      // own errors, this is defense in depth.
      try {
        await refreshEmployeeByEmail(email);
      } catch (e) {
        log.warn("hrm: refreshEmployeeByEmail threw unexpectedly", {
          email,
          error: e instanceof Error ? e.message : String(e),
        });
      }

      if (dbUser.isArchived) return false;

      return true;
    },
    // Node runtime only (see auth.config.ts): this is the callback that
    // touches Prisma, and the middleware's edge instance deliberately has no
    // copy of it.
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email) as string | undefined;
      // Refresh denormalized profile fields on sign-in OR when the client
      // calls `update()` (e.g., after editing the profile).
      const shouldRefresh =
        trigger === "signIn" ||
        trigger === "update" ||
        !token.id ||
        Date.now() - ((token.checkedAt as number) ?? 0) > 10 * 60 * 1000;
      if (email && shouldRefresh) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            role: true,
            isSuperAdmin: true,
            grade: true,
            project: true,
            managerId: true,
            isArchived: true,
            photoFileName: true,
          },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.isSuperAdmin = dbUser.isSuperAdmin;
          token.name = dbUser.name;
          token.grade = dbUser.grade ?? null;
          token.project = dbUser.project ?? null;
          token.managerId = dbUser.managerId ?? null;
          token.isArchived = dbUser.isArchived;
          token.photoFileName = dbUser.photoFileName ?? null;
        }
        token.checkedAt = Date.now();
      }
      return token;
    },
  },
});
