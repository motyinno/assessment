import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNRESOLVED_KINDS = [
  "DUPLICATE_EMAIL",
  "MANAGER_UNRESOLVED",
  "PARENT_UNRESOLVED",
  "HEAD_UNRESOLVED",
];

const EMPTY_RESPONSE = {
  run: null,
  noCorpEmail: [] as unknown[],
  notInHrm: [] as unknown[],
  noGrade: [] as unknown[],
  gradeUnmapped: [] as unknown[],
  unresolved: [] as unknown[],
  roleGrants: [] as unknown[],
};

/**
 * GET /api/hrm/sync/issues?runId=<id|latest> — the "needs a human look" inbox
 * for the Exceptions tab (S07). `notInHrm`/`noGrade` are live snapshots of
 * `User`, not scoped to `runId` — see S07-sync-admin-PLAN.md.
 */
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const runIdParam = new URL(req.url).searchParams.get("runId") ?? "latest";
  const run =
    runIdParam === "latest"
      ? await prisma.hrmSyncRun.findFirst({ orderBy: { startedAt: "desc" } })
      : await prisma.hrmSyncRun.findUnique({ where: { id: runIdParam } });

  if (!run) return NextResponse.json(EMPTY_RESPONSE);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [issues, notInHrm, noGrade, roleGrants] = await Promise.all([
    prisma.hrmSyncIssue.findMany({ where: { runId: run.id } }),
    prisma.user.findMany({
      where: { hrmEmployeeId: null, isArchived: false },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { grade: null, isArchived: false },
      select: { id: true, name: true, email: true, jobTitle: true },
      orderBy: { name: "asc" },
    }),
    prisma.roleAuditLog.findMany({
      where: { newRole: "ADMIN", createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const byKind = (kind: string) => issues.filter((i) => i.kind === kind);

  return NextResponse.json({
    run: { id: run.id, startedAt: run.startedAt, status: run.status },
    noCorpEmail: byKind("NO_CORP_EMAIL"),
    notInHrm,
    noGrade,
    gradeUnmapped: byKind("GRADE_UNMAPPED"),
    unresolved: issues.filter((i) => UNRESOLVED_KINDS.includes(i.kind)),
    roleGrants: roleGrants.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      previousRole: r.previousRole,
      newRole: r.newRole,
      hrmField: r.hrmField,
      createdAt: r.createdAt,
    })),
  });
}
