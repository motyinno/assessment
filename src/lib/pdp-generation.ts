import prisma from "@/lib/prisma";
import { loadTechMatrix } from "@/lib/data-loader";
import { baseGrade } from "@/lib/grades";
import { generateStandalonePDP } from "@/lib/ai-service";
import { buildPdpDocx } from "@/lib/pdp-builder";
import { uploadPdpToDrive } from "@/lib/google-drive";
import { log } from "@/lib/api-helpers";

export interface SelectedTopic {
  title: string;
  skills: string[];
  priority?: boolean;
}

/**
 * The original generation inputs, persisted on the Pdp row so a FAILED plan can
 * be retried in place without the mentor re-selecting anything.
 */
export interface PdpGenerationInputs {
  topicIds: string[];
  customTopics: string[];
}

/**
 * Resolve the mentor's chosen tech-matrix topic ids + free-text custom
 * technologies into the topic list the AI works from. Matrix topics carry their
 * grade-relevant skills; custom technologies are flagged `priority` so the AI is
 * forced to include each one even when it isn't part of the matrix.
 */
export async function resolveSelectedTopics(
  inputs: PdpGenerationInputs,
  grade: string
): Promise<SelectedTopic[]> {
  const base = baseGrade(grade);
  const matrix = await loadTechMatrix();
  // Build an O(1) topic lookup once instead of scanning the matrix N×M times.
  const topicById = new Map<
    string,
    { title: string; jun: string[]; mid: string[]; sen: string[] }
  >();
  for (const section of matrix.sections) {
    for (const topic of section.topics) {
      topicById.set(topic.id, topic);
    }
  }

  const selected: SelectedTopic[] = [];
  for (const tid of inputs.topicIds) {
    const topic = topicById.get(tid);
    if (!topic) continue;
    const skills = (topic[base as keyof typeof topic] as unknown as string[]) ?? [];
    selected.push({ title: topic.title, skills });
  }
  // Mentor-requested technologies: forced into the PDP as priority items even
  // if they aren't part of the grade matrix. De-dupe against matrix titles.
  const existingTitles = new Set(selected.map((t) => t.title.toLowerCase()));
  for (const raw of inputs.customTopics) {
    const title = raw.trim();
    if (!title || existingTitles.has(title.toLowerCase())) continue;
    existingTitles.add(title.toLowerCase());
    selected.push({ title, skills: [], priority: true });
  }
  return selected;
}

/**
 * Run the actual AI generation + docx build + Drive upload for a pdp row, moving
 * it GENERATING → ON_REVIEW on success or → FAILED on error. Fire-and-forget:
 * callers `void` this and return 202 immediately.
 */
export async function runPdpGeneration(opts: {
  pdpId: string;
  assessorId: string;
  userName: string;
  userManager: string;
  userGradeLabel: string;
  selected: SelectedTopic[];
  fileName: string;
}) {
  const {
    pdpId,
    assessorId,
    userName,
    userManager,
    userGradeLabel,
    selected,
    fileName,
  } = opts;
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
