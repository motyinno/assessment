import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { parseJsonBody, serverError } from "@/lib/api-helpers";
import { roadmapProgressSchema } from "@/lib/schemas";
import { buildRoadmap } from "@/lib/roadmap";

export const runtime = "nodejs";

/**
 * Batch set the caller's self-tracked roadmap progress. `userId` always comes
 * from the session, never the body, so a user can only edit their own marks.
 * `done: true` upserts a row; `done: false` removes it. Mirrors the
 * transaction pattern in assessments/[id]/self-assessment.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, roadmapProgressSchema);
  if (parsed.error) return parsed.error;

  const userId = auth.session.user.id;
  const { items } = parsed.data;

  try {
    await prisma.$transaction(
      items.map((item) =>
        item.done
          ? prisma.roadmapProgress.upsert({
              where: {
                userId_topicId_grade: {
                  userId,
                  topicId: item.topicId,
                  grade: item.grade,
                },
              },
              update: { done: true },
              create: {
                userId,
                sectionId: item.sectionId,
                topicId: item.topicId,
                grade: item.grade,
                done: true,
              },
            })
          : prisma.roadmapProgress.deleteMany({
              where: { userId, topicId: item.topicId, grade: item.grade },
            })
      )
    );

    const roadmap = await buildRoadmap(userId);
    return NextResponse.json(roadmap);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
