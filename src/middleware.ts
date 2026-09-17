import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Built from the EDGE-SAFE config, never from "@/lib/auth": that one carries
// the Prisma-backed providers and `jwt` callback, and middleware runs on the
// edge runtime, where Prisma throws. See the note in auth.config.ts.
const { auth } = NextAuth(authConfig);

// Public paths — anything else requires an authenticated session.
// /api/health is intentionally public so that orchestrators (Docker, k8s,
// Caddy) can probe liveness without an auth context.
// /app-icon.png + /icon.png must be reachable without a session so Google Chat
// can fetch the app avatar and browsers can load the favicon on /login.
const publicPaths = [
  "/login",
  "/api/auth",
  "/api/health",
  "/app-icon.png",
  "/icon.png",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic || pathname === "/") return NextResponse.next();

  // Bearer token auth for /api/* — actual validation happens in the route's
  // requireAuth* guard. Middleware only needs to skip the cookie-redirect.
  if (pathname.startsWith("/api/")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.toLowerCase().startsWith("bearer ")) {
      return NextResponse.next();
    }
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth.user?.isArchived) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
