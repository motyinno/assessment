import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import prisma from "./prisma";
import { isEmailAllowed } from "./allowed-domains";

const devLoginEnabled = process.env.ENABLE_DEV_LOGIN === "true";
const devPassword = process.env.DEV_LOGIN_PASSWORD ?? "dev";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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
    ...(devLoginEnabled
      ? [
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
          }),
        ]
      : []),
  ],
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
      if (email && (trigger === "signIn" || !token.id)) {
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
});
