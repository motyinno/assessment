import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import prisma from "./prisma";
import { isEmailAllowed } from "./allowed-domains";

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
// the signed-in assessor. Users must re-authorize when the scope list changes.
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar.events",
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
        return { id: user.id, email: user.email, name: user.name };
      },
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ account, profile }) {
      // Dev credentials bypass the domain allowlist (already verified in authorize())
      if (account?.provider === "dev-credentials") return true;

      if (!isEmailAllowed(profile?.email)) return false;

      const email = profile!.email as string;
      const name = (profile?.name as string | undefined) ?? email.split("@")[0];

      // Persist Google tokens for later Drive API calls
      const tokenData: {
        googleAccessToken?: string;
        googleRefreshToken?: string;
        googleTokenExpiresAt?: Date;
      } = {};
      if (account?.provider === "google") {
        if (account.access_token) tokenData.googleAccessToken = account.access_token;
        if (account.refresh_token) tokenData.googleRefreshToken = account.refresh_token;
        if (account.expires_at) {
          tokenData.googleTokenExpiresAt = new Date(account.expires_at * 1000);
        }
      }

      await prisma.user.upsert({
        where: { email },
        update: { name, ...tokenData },
        create: { email, name, role: "USER", ...tokenData },
      });

      return true;
    },
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email) as string | undefined;
      // Refresh denormalized profile fields on sign-in OR when the client
      // calls `update()` (e.g., after editing the profile).
      const shouldRefresh =
        trigger === "signIn" || trigger === "update" || !token.id;
      if (email && shouldRefresh) {
        const dbUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            role: true,
            grade: true,
            project: true,
            managerId: true,
          },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.grade = dbUser.grade ?? null;
          token.project = dbUser.project ?? null;
          token.managerId = dbUser.managerId ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as typeof session.user & {
          id: string;
          role: string;
          grade: string | null;
          project: string | null;
          managerId: string | null;
        };
        u.id = token.id as string;
        u.role = token.role as string;
        u.grade = (token.grade ?? null) as string | null;
        u.project = (token.project ?? null) as string | null;
        u.managerId = (token.managerId ?? null) as string | null;
      }
      return session;
    },
  },
});
