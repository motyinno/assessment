import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { patchSystemDesignTaskSchema } from "@/lib/schemas";
import { parseJsonBody, notFound, conflict } from "@/lib/api-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, patchSystemDesignTaskSchema);
  if (parsed.error) return parsed.error;
  const { title, description, difficulty, isArchived } = parsed.data;

  const existing = await prisma.systemDesignTask.findUnique({
    where: { id: params.id },
  });
  if (!existing) return notFound("Task not found");

  const task = await prisma.systemDesignTask.update({
    where: { id: params.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(difficulty !== undefined
        ? { difficulty: difficulty?.trim() || null }
        : {}),
      ...(isArchived !== undefined ? { isArchived } : {}),
    },
  });

  return NextResponse.json(task);
}

/**
 * Hard-delete a pool task. Blocked when the task is referenced by any
 * assessment so historical selections stay intact — archive it instead.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const existing = await prisma.systemDesignTask.findUnique({
    where: { id: params.id },
    include: { _count: { select: { assessmentLinks: true } } },
  });
  if (!existing) return notFound("Task not found");

  if (existing._count.assessmentLinks > 0) {
    return conflict(
      "This task is used by one or more assessments. Archive it instead of deleting."
    );
  }

  await prisma.systemDesignTask.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
