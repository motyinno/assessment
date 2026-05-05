import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { uploadPdpToDrive } from "@/lib/google-drive";
import { getValidAccessToken } from "@/lib/google-auth";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const role = session!.user.role;
  const where =
    role === "ASSESSOR" || role === "ADMIN"
      ? {}
      : {
          userId: session!.user.id,
          status: { not: "ON_REVIEW" },
        };

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
  const { error, session } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const userId = (formData.get("userId") as string) || session!.user.id;
  const assessmentId = formData.get("assessmentId") as string | null;
  const fileName = formData.get("fileName") as string;
  const topicsJson = formData.get("topicsJson") as string;

  if (!file || !fileName) {
    return NextResponse.json(
      { error: "file и fileName обязательны" },
      { status: 400 }
    );
  }

  const uploaderId = session!.user.id;
  const driveToken = await getValidAccessToken(uploaderId);
  if (!driveToken) {
    return NextResponse.json(
      { error: "Подключите Google Drive в профиле — без него ИПР сохранить негде" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const driveResult = await uploadPdpToDrive(uploaderId, fileName, buffer);
  if (!driveResult) {
    return NextResponse.json(
      { error: "Не удалось загрузить файл в Google Drive" },
      { status: 502 }
    );
  }

  const pdp = await prisma.pdp.create({
    data: {
      userId,
      createdById: uploaderId,
      assessmentId: assessmentId || null,
      fileName,
      driveFileId: driveResult.fileId,
      driveLink: driveResult.webViewLink,
      topicsJson: topicsJson || "[]",
      status: "ON_REVIEW",
    },
  });

  return NextResponse.json(pdp, { status: 201 });
}
