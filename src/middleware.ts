import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
