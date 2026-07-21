import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  requireAssessmentRead,
  requireAssessmentSessionRunner,
} from "@/lib/auth-helpers";
import { assessmentSystemDesignTasksSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";

/** The system-design tasks the assessor selected for this assessment. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentRead(params.id);
  if (guard.error) return guard.error;

  const links = await prisma.assessmentSystemDesignTask.findMany({
    where: { assessmentId: params.id },
    include: { task: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(links.map((l) => l.task));
}

/**
 * Replace the full set of tasks used for this assessment. Only the assessor(s)
 * running the assessment may change it.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAssessmentSessionRunner(params.id);
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, assessmentSystemDesignTasksSchema);
  if (parsed.error) return parsed.error;
  const taskIds = Array.from(new Set(parsed.data.taskIds));

  await prisma.$transaction(async (tx) => {
    await tx.assessmentSystemDesignTask.deleteMany({
      where: {
        assessmentId: params.id,
        ...(taskIds.length > 0 ? { taskId: { notIn: taskIds } } : {}),
      },
    });

    if (taskIds.length > 0) {
      await tx.assessmentSystemDesignTask.createMany({
        data: taskIds.map((taskId) => ({ assessmentId: params.id, taskId })),
        skipDuplicates: true,
      });
    }
  });

  const links = await prisma.assessmentSystemDesignTask.findMany({
    where: { assessmentId: params.id },
    include: { task: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(links.map((l) => l.task));
}
