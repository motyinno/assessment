import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import prisma from "./prisma";
import { isEmailAllowed } from "./allowed-domains";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ profile }) {
      if (!isEmailAllowed(profile?.email)) return false;

      const email = profile!.email as string;
      const name = (profile?.name as string | undefined) ?? email.split("@")[0];

      await prisma.user.upsert({
        where: { email },
        update: { name },
        create: { email, name, role: "USER" },
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
