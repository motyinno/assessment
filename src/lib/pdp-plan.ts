import { z } from "zod";
import type { Prisma, PdpItemType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { log } from "@/lib/logger";
import { isAdmin, isStaff } from "@/lib/roles";
import { getAdminDivisionScope, getStaffDivisionScope, isUserInScope } from "@/lib/admin-scope";
import { generateStandalonePDP, type TechMatrixTopicInput } from "@/lib/ai-service";
import { buildPdpDocx, type PdpRow } from "@/lib/pdp-builder";
import { replaceDriveDocContent, shareDriveFile, uploadPdpToDrive } from "@/lib/google-drive";
import { loadTechMatrix } from "@/lib/data-loader";
import { resolveUserDivision } from "@/lib/user-division";
import { baseGrade, gradeLabel } from "@/lib/grades";

/**
 * PDP builder: the plan lives in the app as goals (topics) with items
 * (questions and practical tasks). The employee's direct manager — or an admin
 * of their division — drafts it (AI first pass), arranges it in the builder and
 * approves it; approval builds the Google Doc from the plan. The doc is a
 * generated mirror: later edits go through the builder and "Update document".
 */

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

type Viewer = { id: string; role?: string | null; isSuperAdmin?: boolean | null };
type Subject = { id: string; managerId: string | null };

/**
 * May `me` compose and approve a PDP for `subject`? Their direct manager, or an
 * admin whose division covers them. Never for yourself.
 */
export async function canComposePdp(me: Viewer, subject: Subject): Promise<boolean> {
  if (me.id === subject.id) return false;
  if (subject.managerId === me.id) return true;
  if (!isAdmin(me.role)) return false;
  return isUserInScope(subject.id, await getAdminDivisionScope(me));
}

/** Statuses the employee can see: drafts stay with whoever is composing. */
export const SUBJECT_VISIBLE_STATUSES = ["ACTIVE", "COMPLETED"] as const;

export async function canViewPdp(
  me: Viewer,
  pdp: { userId: string; status: string },
  subject: Subject
): Promise<boolean> {
  if (me.id === pdp.userId) return (SUBJECT_VISIBLE_STATUSES as readonly string[]).includes(pdp.status);
  if (await canComposePdp(me, subject)) return true;
  if (!isStaff(me.role)) return false;
  return isUserInScope(pdp.userId, await getStaffDivisionScope(me));
}

// ---------------------------------------------------------------------------
// Plan shape
// ---------------------------------------------------------------------------

// Ids may come from the client (crypto.randomUUID) for new goals/items, which
// keeps autosave simple: no temp-id remapping after each save.
const planId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const planItemSchema = z.object({
  id: planId.optional(),
  type: z.enum(["THEORY", "PRACTICE"]),
  text: z.string().trim().min(1).max(4000),
});

export const planGoalSchema = z.object({
  id: planId.optional(),
  title: z.string().trim().min(1).max(200),
  matrixTopicId: z.string().nullish(),
  items: z.array(planItemSchema).max(50),
});

export const planSchema = z.object({
  goals: z.array(planGoalSchema).max(40),
});

export type PlanGoalInput = z.infer<typeof planGoalSchema>;

export const pdpPlanInclude = {
  goals: {
    orderBy: { order: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  },
} satisfies Prisma.PdpInclude;

type GoalWithItems = Prisma.PdpGoalGetPayload<{ include: { items: true } }>;

/** Goals → template rows: questions as bullets, practice items as tasks. */
export function planToDocRows(goals: Array<Pick<GoalWithItems, "title" | "items">>): PdpRow[] {
  return goals.map((g) => ({
    category: g.title,
    questions: g.items.filter((i) => i.type === "THEORY").map((i) => i.text),
    practicalTasks: g.items.filter((i) => i.type === "PRACTICE").map((i) => i.text),
  }));
}

/** AI topic → goal input. Questions first, then the practical task. */
export function aiTopicToGoal(
  topic: { category: string; questions: string[]; practicalTask?: string },
  matrixTopicId: string | null
): PlanGoalInput {
  const items: PlanGoalInput["items"] = [];
  for (const q of topic.questions ?? []) if (typeof q === "string" && q.trim()) items.push({ type: "THEORY", text: q.trim() });
  if (topic.practicalTask?.trim()) items.push({ type: "PRACTICE", text: topic.practicalTask.trim() });
  return { title: topic.category, matrixTopicId, items };
}

/**
 * Replace the plan with `goals`, keeping the ids of goals/items the client
 * sent back (so future progress tracking survives edits) and dropping the rest.
 */
export async function savePlan(pdpId: string, goals: PlanGoalInput[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.pdpGoal.findMany({ where: { pdpId }, include: { items: true } });
    const existingGoalIds = new Set(existing.map((g) => g.id));
    const existingItemGoal = new Map(existing.flatMap((g) => g.items.map((i) => [i.id, g.id] as const)));

    const keptGoalIds = new Set<string>();
    const keptItemIds = new Set<string>();

    for (const [gi, goal] of goals.entries()) {
      const goalData = { order: gi, title: goal.title, matrixTopicId: goal.matrixTopicId ?? null };
      let goalId: string;
      if (goal.id && existingGoalIds.has(goal.id)) {
        goalId = goal.id;
        await tx.pdpGoal.update({ where: { id: goalId }, data: goalData });
      } else {
        goalId = (await tx.pdpGoal.create({ data: { ...(goal.id ? { id: goal.id } : {}), pdpId, ...goalData } })).id;
      }
      keptGoalIds.add(goalId);

      for (const [ii, item] of goal.items.entries()) {
        const itemData = { goalId, order: ii, type: item.type as PdpItemType, text: item.text };
        // An item may move between goals; it only has to belong to this plan.
        if (item.id && existingItemGoal.has(item.id)) {
          await tx.pdpItem.update({ where: { id: item.id }, data: itemData });
          keptItemIds.add(item.id);
        } else {
          keptItemIds.add((await tx.pdpItem.create({ data: { ...(item.id ? { id: item.id } : {}), ...itemData } })).id);
        }
      }
    }

    const staleItems = [...existingItemGoal.keys()].filter((id) => !keptItemIds.has(id));
    if (staleItems.length) await tx.pdpItem.deleteMany({ where: { id: { in: staleItems } } });
    const staleGoals = [...existingGoalIds].filter((id) => !keptGoalIds.has(id));
    if (staleGoals.length) await tx.pdpGoal.deleteMany({ where: { id: { in: staleGoals } } });

    await tx.pdp.update({ where: { id: pdpId }, data: { planUpdatedAt: new Date() } });
  });
}

// ---------------------------------------------------------------------------
// AI draft
// ---------------------------------------------------------------------------

export interface PdpGenerationInputs {
  topicIds: string[];
  customTopics: string[];
  assessmentId?: string | null;
}

/** A previous score below this marks a topic as a gap worth a PDP goal. */
export const PDP_GAP_THRESHOLD = 7;

export interface DraftTopic extends TechMatrixTopicInput {
  matrixTopicId: string | null;
}

/**
 * Resolve picker input into the topics the AI drafts from: matrix topics carry
 * the subject's grade skills (and the assessment result when the plan is based
 * on one); custom technologies are forced in as priority topics.
 */
export async function resolveDraftTopics(subjectId: string, grade: string, inputs: PdpGenerationInputs): Promise<DraftTopic[]> {
  const band = baseGrade(grade);
  const division = await resolveUserDivision(subjectId);
  const matrix = division ? await loadTechMatrix(division.id) : { sections: [] };
  const byId = new Map(matrix.sections.flatMap((s) => s.topics).map((t) => [t.id, t]));

  const results = inputs.assessmentId
    ? await prisma.assessmentResult.findMany({ where: { assessmentId: inputs.assessmentId } })
    : [];
  const resultByKey = new Map(results.map((r) => [r.category.toLowerCase(), r]));

  const out: DraftTopic[] = [];
  for (const id of inputs.topicIds) {
    const t = byId.get(id);
    if (!t) continue;
    const r = resultByKey.get(id.toLowerCase()) ?? resultByKey.get(t.title.toLowerCase());
    out.push({
      title: t.title,
      skills: t[band] ?? [],
      matrixTopicId: t.id,
      previousScore: r?.score ?? null,
      assessorComment: r?.comment ?? null,
    });
  }
  const seen = new Set(out.map((t) => t.title.toLowerCase()));
  for (const raw of inputs.customTopics) {
    const title = raw.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, skills: [], priority: true, matrixTopicId: null });
  }
  return out;
}

/** Ask the AI for goals; titles are matched back to the topics we sent. */
export async function draftGoals(topics: DraftTopic[], subject: { name: string; grade: string }): Promise<PlanGoalInput[]> {
  const ai = await generateStandalonePDP(topics, subject.name, gradeLabel(subject.grade), null);
  const byTitle = new Map(topics.map((t) => [t.title.toLowerCase(), t]));
  const goals = ai.pdpTopics
    .filter((t) => t && typeof t.category === "string")
    .map((t) => aiTopicToGoal(t, byTitle.get(t.category.toLowerCase())?.matrixTopicId ?? null))
    .filter((g) => g.items.length > 0);
  // Keep the picker's order.
  const order = new Map(topics.map((t, i) => [t.title.toLowerCase(), i]));
  goals.sort((a, b) => (order.get(a.title.toLowerCase()) ?? 999) - (order.get(b.title.toLowerCase()) ?? 999));
  return goals;
}

/**
 * Background job: AI first draft → goals/items, GENERATING → DRAFT (or FAILED).
 * Fire-and-forget; never throws.
 */
export async function runDraftGeneration(pdpId: string): Promise<void> {
  try {
    const pdp = await prisma.pdp.findUnique({
      where: { id: pdpId },
      include: { user: { select: { id: true, name: true, grade: true } } },
    });
    if (!pdp || pdp.status !== "GENERATING") return;
    if (!pdp.user.grade) throw new Error("The employee has no grade set");
    const inputs = pdp.generationInputs as unknown as PdpGenerationInputs;
    const topics = await resolveDraftTopics(pdp.userId, pdp.user.grade, inputs);
    if (topics.length === 0) throw new Error("None of the selected topics exist in the matrix");

    const goals = await draftGoals(topics, { name: pdp.user.name, grade: pdp.user.grade });
    if (goals.length === 0) throw new Error("The AI returned an empty plan");

    await savePlan(pdpId, goals);
    await prisma.pdp.update({ where: { id: pdpId }, data: { status: "DRAFT", error: null } });
  } catch (e) {
    log.error("PDP draft generation failed", { pdpId, error: e instanceof Error ? e.message : String(e) });
    await prisma.pdp
      .update({
        where: { id: pdpId },
        data: { status: "FAILED", error: e instanceof Error ? e.message : "Generation error" },
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Google Doc
// ---------------------------------------------------------------------------

export class PdpDocError extends Error {}

/**
 * Build the Google Doc from the current plan and store its link. Rewrites the
 * existing doc in place when we can (same link), otherwise creates a new one.
 * Uses the acting user's Google token; shares the doc with the employee.
 */
export async function publishPdpDoc(pdpId: string, actor: { id: string; name: string }): Promise<{ driveLink: string }> {
  const pdp = await prisma.pdp.findUniqueOrThrow({
    where: { id: pdpId },
    include: {
      ...pdpPlanInclude,
      user: { select: { name: true, email: true, manager: { select: { name: true } } } },
      assessment: { select: { completedAt: true } },
    },
  });
  if (pdp.goals.length === 0) throw new PdpDocError("The plan is empty — add at least one topic");

  const buffer = await buildPdpDocx(
    {
      employee: pdp.user.name,
      manager: pdp.user.manager?.name ?? null,
      composer: actor.name,
      composedOn: new Date(),
      assessedOn: pdp.assessment?.completedAt ?? null,
    },
    planToDocRows(pdp.goals)
  );

  let result = pdp.driveFileId ? await replaceDriveDocContent(actor.id, pdp.driveFileId, buffer) : null;
  if (!result) {
    result = await uploadPdpToDrive(actor.id, pdp.fileName, buffer);
    if (!result) {
      throw new PdpDocError("Couldn't save the document to Google Drive. Connect Google in your profile and try again.");
    }
  }
  await shareDriveFile(actor.id, result.fileId, pdp.user.email);

  await prisma.pdp.update({
    where: { id: pdpId },
    data: { driveFileId: result.fileId, driveLink: result.webViewLink, docSyncedAt: new Date() },
  });
  return { driveLink: result.webViewLink };
}
