import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { isStaff } from "@/lib/roles";
import { uploadPdpToDrive } from "@/lib/google-drive";
import { getValidAccessToken } from "@/lib/google-auth";
import { badRequest } from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const where = isStaff(me.role)
    ? {}
    : { userId: me.id, status: { not: "ON_REVIEW" as const } };

  const pdps = await prisma.pdp.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      assessment: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pdps);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const formData = await req.formData();
  const file = formData.get("file");
  const fileName = formData.get("fileName") as string | null;
  const assessmentId = (formData.get("assessmentId") as string | null) || null;
  const topicsJsonRaw = (formData.get("topicsJson") as string | null) ?? "[]";

  if (!(file instanceof File) || !fileName) {
    return badRequest("file and fileName are required");
  }

  // Always own-self upload — the previous IDOR allowed `userId` to be
  // smuggled in via formData. Drive credentials are the caller's; the row
  // is filed under the caller.
  const userId = me.id;
  const driveToken = await getValidAccessToken(userId);
  if (!driveToken) {
    return badRequest("Connect Google Drive in your profile — PDPs need somewhere to be saved");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const driveResult = await uploadPdpToDrive(userId, fileName, buffer);
  if (!driveResult) {
    return NextResponse.json(
      { error: { code: "BAD_GATEWAY", message: "Failed to upload the file to Google Drive" } },
      { status: 502 }
    );
  }

  let topicsJson: unknown = [];
  try {
    topicsJson = JSON.parse(topicsJsonRaw);
  } catch {
    topicsJson = [];
  }

  const pdp = await prisma.pdp.create({
    data: {
      userId,
      createdById: userId,
      assessmentId,
      fileName,
      driveFileId: driveResult.fileId,
      driveLink: driveResult.webViewLink,
      topicsJson: topicsJson as object,
      status: "ON_REVIEW",
    },
  });

  return NextResponse.json(pdp, { status: 201 });
}
