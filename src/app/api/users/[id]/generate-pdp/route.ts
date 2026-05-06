import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade, gradeLabel } from "@/lib/grades";
import { generateStandalonePDP } from "@/lib/ai-service";
import { buildPdpDocx } from "@/lib/pdp-builder";
import { uploadPdpToDrive } from "@/lib/google-drive";
import { getValidAccessToken } from "@/lib/google-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  topicIds: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAssessor();
  if (error) return error;

  const { id: targetUserId } = await params;
  const body = (await req.json()) as Body;
  const topicIds = Array.isArray(body.topicIds) ? body.topicIds : [];
  if (topicIds.length === 0) {
    return NextResponse.json({ error: "Select at least one topic" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { manager: { select: { name: true } } },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.grade) {
    return NextResponse.json(
      { error: "User profile has no grade set" },
      { status: 400 }
    );
  }

  const assessorId = session!.user.id;
  const driveToken = await getValidAccessToken(assessorId);
  if (!driveToken) {
    return NextResponse.json(
      { error: "Connect Google Drive in your profile — PDPs need somewhere to be saved" },
      { status: 400 }
    );
  }

  // Filter tech matrix to selected topic ids, pulling grade-relevant skills
  const base = baseGrade(user.grade);
  const matrix = loadTechMatrix();
  const selected: { title: string; skills: string[] }[] = [];
  for (const section of matrix.sections) {
    for (const topic of section.topics) {
      if (topicIds.includes(topic.id)) {
        const skills = (topic[base as keyof typeof topic] as unknown as string[]) ?? [];
        selected.push({ title: topic.title, skills });
      }
    }
  }
  if (selected.length === 0) {
    return NextResponse.json(
      { error: "None of the selected topics match the grade" },
      { status: 400 }
    );
  }

  // Create the placeholder row up-front so the client can show progress immediately.
  const fileName = `PDP - ${user.name} - ${new Date().toISOString().slice(0, 10)}.docx`;
  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: assessorId,
      fileName,
      status: "GENERATING",
      topicsJson: "[]",
    },
  });

  // Fire and forget — do the heavy work (AI + docx + Drive) after we've returned.
  void generatePdpInBackground({
    pdpId: pdp.id,
    assessorId,
    userName: user.name,
    userManager: user.manager?.name ?? "",
    userGradeLabel: gradeLabel(user.grade),
    selected,
    fileName,
  });

  return NextResponse.json(pdp, { status: 202 });
}

async function generatePdpInBackground(opts: {
  pdpId: string;
  assessorId: string;
  userName: string;
  userManager: string;
  userGradeLabel: string;
  selected: { title: string; skills: string[] }[];
  fileName: string;
}) {
  const { pdpId, assessorId, userName, userManager, userGradeLabel, selected, fileName } = opts;
  try {
    const ai = await generateStandalonePDP(selected, userName, userGradeLabel);

    const buffer = await buildPdpDocx(
      { employee: userName, manager: userManager, next_date: "" },
      ai.pdpTopics,
      { includeTasks: true }
    );

    const driveResult = await uploadPdpToDrive(assessorId, fileName, buffer);
    if (!driveResult) {
      throw new Error("Failed to upload PDP to Google Drive");
    }

    await prisma.pdp.update({
      where: { id: pdpId },
      data: {
        driveFileId: driveResult.fileId,
        driveLink: driveResult.webViewLink,
        topicsJson: JSON.stringify(ai.pdpTopics),
        status: "ON_REVIEW",
        error: null,
      },
    });
  } catch (e) {
    console.error("PDP background generation failed:", e);
    await prisma.pdp
      .update({
        where: { id: pdpId },
        data: {
          status: "FAILED",
          error: e instanceof Error ? e.message : "Generation error",
        },
      })
      .catch(() => {});
  }
}
