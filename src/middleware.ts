import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Public paths — anything else requires an authenticated session.
// /api/health is intentionally public so that orchestrators (Docker, k8s,
// Caddy) can probe liveness without an auth context.
const publicPaths = ["/login", "/api/auth", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic = publicPaths.some((p) => pathname.startsWith(p));
  if (isPublic || pathname === "/") return NextResponse.next();

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
