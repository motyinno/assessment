import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 50;

/** GET /api/hrm/sync/runs — paginated log of HRM sync runs, newest first. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const searchParams = new URL(req.url).searchParams;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? "20") || 20)
  );

  const [items, total] = await Promise.all([
    prisma.hrmSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.hrmSyncRun.count(),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
