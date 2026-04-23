import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { uploadPdpToDrive } from "@/lib/google-drive";
import path from "path";
import fs from "fs/promises";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const where =
    session!.user.role === "ASSESSOR"
      ? {}
      : { userId: session!.user.id };

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

  // Save file to disk
  const pdpsDir = path.join(process.cwd(), "data", "pdps");
  await fs.mkdir(pdpsDir, { recursive: true });

  const pdp = await prisma.pdp.create({
    data: {
      userId,
      assessmentId: assessmentId || null,
      fileName,
      filePath: "", // will update after we know the id
      topicsJson: topicsJson || "[]",
    },
  });

  const filePath = path.join(pdpsDir, `${pdp.id}.docx`);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  // Upload to Google Drive of the uploader (the assessor/admin generating the PDP).
  // Falls back silently if the user hasn't connected Google (e.g. dev-credentials logins).
  const driveResult = await uploadPdpToDrive(session!.user.id, fileName, buffer).catch(
    (e) => {
      console.error("Drive upload threw:", e);
      return null;
    }
  );

  const updated = await prisma.pdp.update({
    where: { id: pdp.id },
    data: {
      filePath: `data/pdps/${pdp.id}.docx`,
      driveFileId: driveResult?.fileId ?? null,
      driveLink: driveResult?.webViewLink ?? null,
    },
  });

  return NextResponse.json(updated, { status: 201 });
}
