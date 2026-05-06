import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { startPdpReaper } from "@/lib/pdp-reaper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Docker pings /api/health every 30s, which makes it the natural place to
// kick off the in-process PDP reaper exactly once per container.
startPdpReaper();

/**
 * GET /api/health
 *
 * Liveness + readiness in one. Returns 200 only if the DB is reachable, so
 * Docker / Caddy / k8s can use this directly without a separate readiness
 * endpoint. Intentionally cheap: a SELECT 1 round-trip.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (e) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "unreachable",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
