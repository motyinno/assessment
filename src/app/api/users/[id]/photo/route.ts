import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { hrmSyncEnabled, hrmConfig } from "@/lib/hrm/config";
import { getFileToken, buildPhotoUrl } from "@/lib/hrm/photos";
import { notFound } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  // Must come before any call that reaches hrmConfig() — see config.ts's own
  // invariant. Without this, a HRM_SYNC_ENABLED=false install (empty HRM env)
  // 500s on every avatar instead of degrading to initials.
  if (!hrmSyncEnabled()) return notFound();

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { photoFileName: true },
  });
  if (!user?.photoFileName) return notFound();

  // Not wrapped in try/catch on purpose: a thrown error here (network error,
  // or HrmConfigError if the rest of the env is incomplete despite the flag
  // being on) is a genuine HRM outage, not "person has no photo" — an
  // unhandled 500 from the route handler is the correct signal.
  const token = await getFileToken();
  const url = hrmConfig().apiUrl + buildPhotoUrl(user.photoFileName, token);

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
