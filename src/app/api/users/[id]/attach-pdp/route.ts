import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";

interface Body {
  driveLink?: string;
  fileName?: string;
}

/**
 * Extract the Google Drive / Docs file id from a variety of URL shapes.
 * Returns null if the URL does not look like a Google resource.
 */
function parseDriveFileId(url: string): string | null {
  // https://drive.google.com/file/d/FILEID/view
  // https://docs.google.com/document/d/FILEID/edit
  const m1 = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m1) return m1[1];
  // https://drive.google.com/open?id=FILEID
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
  const { error, session } = await requireAssessor();
  if (error) return error;

  const { id: targetUserId } = await params;
  const body = (await req.json()) as Body;
  const driveLink = body.driveLink?.trim();
  if (!driveLink) {
    return NextResponse.json({ error: "Ссылка обязательна" }, { status: 400 });
  }
  if (!isProbablyDriveUrl(driveLink)) {
    return NextResponse.json(
      { error: "Похоже, это не ссылка на Google Drive / Docs" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const driveFileId = parseDriveFileId(driveLink);
  const fileName =
    body.fileName?.trim() ||
    `PDP (ссылка) - ${user.name} - ${new Date().toISOString().slice(0, 10)}`;

  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: session!.user.id,
      fileName,
      driveLink,
      driveFileId,
      topicsJson: "[]",
      status: "ACTIVE",
    },
  });

  return NextResponse.json(pdp, { status: 201 });
}
