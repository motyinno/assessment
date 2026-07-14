import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUserAccess } from "@/lib/auth-helpers";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade, gradeLabel } from "@/lib/grades";
import { generateStandalonePDP } from "@/lib/ai-service";
import { buildPdpDocx } from "@/lib/pdp-builder";
import { uploadPdpToDrive } from "@/lib/google-drive";
import { getValidAccessToken } from "@/lib/google-auth";
import { generatePdpSchema } from "@/lib/schemas";
import {
  badRequest,
  notFound,
  parseJsonBody,
  log,
} from "@/lib/api-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  // Caller must be ADMIN, the user themselves, or the user's manager.
  const guard = await requireUserAccess(targetUserId);
  if (guard.error) return guard.error;
  const me = guard.session.user;

  const parsed = await parseJsonBody(req, generatePdpSchema);
  if (parsed.error) return parsed.error;
  const { topicIds } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { manager: { select: { name: true } } },
  });
  if (!user) return notFound("User not found");
  if (!user.grade) return badRequest("User profile has no grade set");

  const driveToken = await getValidAccessToken(me.id);
  if (!driveToken) {
    return badRequest("Connect Google Drive in your profile — PDPs need somewhere to be saved");
  }

  // Filter tech matrix to selected topic ids, pulling grade-relevant skills
  const base = baseGrade(user.grade);
  const matrix = await loadTechMatrix();
  // Build an O(1) topic lookup once instead of scanning the matrix N×M times.
  const topicById = new Map<string, { title: string; jun: string[]; mid: string[]; sen: string[] }>();
  for (const section of matrix.sections) {
    for (const topic of section.topics) {
      topicById.set(topic.id, topic);
    }
  }
  const selected: { title: string; skills: string[] }[] = [];
  for (const tid of topicIds) {
    const topic = topicById.get(tid);
    if (!topic) continue;
    const skills = (topic[base as keyof typeof topic] as unknown as string[]) ?? [];
    selected.push({ title: topic.title, skills });
  }
  if (selected.length === 0) {
    return badRequest("None of the selected topics match the grade");
  }

  const fileName = `PDP - ${user.name} - ${new Date().toISOString().slice(0, 10)}.docx`;
  const pdp = await prisma.pdp.create({
    data: {
      userId: user.id,
      createdById: me.id,
      fileName,
      status: "GENERATING",
      topicsJson: [],
    },
  });

  void generatePdpInBackground({
    pdpId: pdp.id,
    assessorId: me.id,
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
    if (!driveResult) throw new Error("Failed to upload PDP to Google Drive");

    await prisma.pdp.update({
      where: { id: pdpId },
      data: {
        driveFileId: driveResult.fileId,
        driveLink: driveResult.webViewLink,
        topicsJson: ai.pdpTopics,
        status: "ON_REVIEW",
        error: null,
      },
    });
  } catch (e) {
    log.error("PDP background generation failed", {
      pdpId,
      error: e instanceof Error ? e.message : String(e),
    });
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
