import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor } from "@/lib/auth-helpers";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade, gradeLabel } from "@/lib/grades";
import { generateStandalonePDP } from "@/lib/ai-service";
import { buildPdpDocx } from "@/lib/pdp-builder";
import { uploadPdpToDrive } from "@/lib/google-drive";
import path from "path";
import fs from "fs/promises";

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
    return NextResponse.json({ error: "Выберите хотя бы одну тему" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (!user.grade) {
    return NextResponse.json(
      { error: "В профиле пользователя не указан грейд" },
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
      { error: "Ни одна из выбранных тем не соответствует грейду" },
      { status: 400 }
    );
  }

  // Create the placeholder row up-front so the client can show progress immediately.
  const fileName = `PDP - ${user.name} - ${new Date().toISOString().slice(0, 10)}.docx`;
  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      fileName,
      filePath: "",
      status: "GENERATING",
      topicsJson: "[]",
    },
  });

  // Fire and forget — do the heavy work (AI + docx + Drive) after we've returned.
  const pdpId = pdp.id;
  const assessorId = session!.user.id;
  const userGradeLabel = gradeLabel(user.grade);
  const userName = user.name;
  const userManager = user.manager ?? "";

  void generatePdpInBackground({
    pdpId,
    assessorId,
    userName,
    userManager,
    userGradeLabel,
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

    const pdpsDir = path.join(process.cwd(), "data", "pdps");
    await fs.mkdir(pdpsDir, { recursive: true });
    const filePath = path.join(pdpsDir, `${pdpId}.docx`);
    await fs.writeFile(filePath, buffer);

    const driveResult = await uploadPdpToDrive(assessorId, fileName, buffer).catch((e) => {
      console.error("Drive upload threw:", e);
      return null;
    });

    await prisma.pdp.update({
      where: { id: pdpId },
      data: {
        filePath: `data/pdps/${pdpId}.docx`,
        driveFileId: driveResult?.fileId ?? null,
        driveLink: driveResult?.webViewLink ?? null,
        topicsJson: JSON.stringify(ai.pdpTopics),
        status: "DRAFT",
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
          error: e instanceof Error ? e.message : "Ошибка генерации",
        },
      })
      .catch(() => {});
  }
}
