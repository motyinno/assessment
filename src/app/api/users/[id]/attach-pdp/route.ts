import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { attachPdpSchema } from "@/lib/schemas";
import { badRequest, notFound, parseJsonBody } from "@/lib/api-helpers";

/**
 * Extract the Google Drive / Docs file id from a variety of URL shapes.
 * Returns null if the URL does not look like a Google resource.
 */
function parseDriveFileId(url: string): string | null {
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

function isProbablyDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /(^|\.)google\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  const guard = await requireUserAccess(targetUserId);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, attachPdpSchema);
  if (parsed.error) return parsed.error;
  const driveLink = parsed.data.driveLink.trim();
  if (!driveLink) return badRequest("Link is required");
  if (!isProbablyDriveUrl(driveLink)) {
    return badRequest("This doesn't look like a Google Drive / Docs link");
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true },
  });
  if (!user) return notFound("User not found");

  const driveFileId = parseDriveFileId(driveLink);
  const fileName =
    parsed.data.fileName?.trim() ||
    `PDP (link) - ${user.name} - ${new Date().toISOString().slice(0, 10)}`;

  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: me.id,
      fileName,
      driveLink,
      driveFileId,
      topicsJson: [],
      status: "ACTIVE",
    },
  });

  return NextResponse.json(pdp, { status: 201 });
}
