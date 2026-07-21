import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAssessor, requireAdmin } from "@/lib/auth-helpers";
import { createSystemDesignTaskSchema } from "@/lib/schemas";
import { parseJsonBody } from "@/lib/api-helpers";

/**
 * The admin-curated pool of system-design problems. Staff (assessors and up)
 * read it to pick a task while running a SYSTEM_DESIGN assessment; only admins
 * create/edit/archive entries.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAssessor();
  if (guard.error) return guard.error;

  // Archived tasks are hidden from the picker but visible to the admin manager
  // via ?includeArchived=1.
  const includeArchived =
    req.nextUrl.searchParams.get("includeArchived") === "1";

  const tasks = await prisma.systemDesignTask.findMany({
    where: includeArchived ? {} : { isArchived: false },
    orderBy: [{ isArchived: "asc" }, { title: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const parsed = await parseJsonBody(req, createSystemDesignTaskSchema);
  if (parsed.error) return parsed.error;
  const { title, description, difficulty } = parsed.data;

  const task = await prisma.systemDesignTask.create({
    data: {
      title,
      description: description ?? "",
      difficulty: difficulty?.trim() || null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
