import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizePath } from "@/lib/activity";
import { recordActivity } from "@/lib/activity-server";

/** Page-view beacon from the app layout (components/activity-beacon). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new NextResponse(null, { status: 204 });
  const body = await req.json().catch(() => null);
  const path = normalizePath((body as { path?: unknown } | null)?.path);
  if (path) await recordActivity(session.user.id, "view", path);
  return new NextResponse(null, { status: 204 });
}
