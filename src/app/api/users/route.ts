import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isEmailAllowed, allowedEmailDomains } from "@/lib/allowed-domains";
import { canManagePeople, isAdmin, isStaff, ROLES } from "@/lib/roles";
import { createUserSchema } from "@/lib/schemas";
import {
  badRequest,
  conflict,
  parseJsonBody,
} from "@/lib/api-helpers";
import type { Prisma, UserRole } from "@prisma/client";

const STAFF_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  grade: true,
  project: true,
  projects: true,
  jobTitle: true,
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  photoFileName: true,
  createdAt: true,
  isArchived: true,
  hrmEmployeeId: true,
  departments: {
    select: {
      department: { select: { id: true, name: true, isFilterable: true } },
    },
  },
} as const;

const SLIM_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isArchived: true,
  photoFileName: true,
  jobTitle: true,
  departments: {
    select: {
      department: { select: { id: true, name: true, isFilterable: true } },
    },
  },
} as const;

type CallerForGradeRedaction = { role: string | null; id: string };

/**
 * Grade is company-wide sensitive info (S05): after the auto-grant expands
 * who holds MANAGER, only ADMIN and the row's own direct manager should see
 * it. Post-processes the query result rather than the `select` — Prisma has
 * no per-row conditional select, and `STAFF_USER_SELECT` is one static
 * object shared by every row of one query (see S05 plan). No-op for rows
 * without a `grade` key (the SLIM_USER_SELECT shape).
 */
function redactGradeForCaller<T extends { id: string; managerId?: string | null }>(
  items: T[],
  me: CallerForGradeRedaction
): T[] {
  if (isAdmin(me.role)) return items;
  if (!("grade" in (items[0] ?? {}))) return items;
  return items.map((u) =>
    canManagePeople(me.role) && u.managerId === me.id ? u : { ...u, grade: null }
  );
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Query params that didn't exist before S08. A request carrying none of them
// gets the pre-S08 flat-array response (see risk note in the S08 spec): API
// tokens may be hitting this endpoint without knowing the contract changed,
// and we can't grep their code. Sunset after a month of clean logs.
const NEW_PARAMS = [
  "q",
  "department",
  "includeDescendants",
  "managerId",
  "ids",
  "page",
  "pageSize",
  "sort",
  "order",
] as const;

/**
 * GET /api/users
 * - Staff (ASSESSOR/MANAGER/ADMIN) get the full directory shape.
 * - Regular users get a slim payload (id, name, email, role) so combobox-style
 *   pickers in the UI keep working without leaking grade/project/manager.
 *
 * Paginated, server-filtered directory search. See temp/specs/S08-server-lists.md
 * for the contract. Responds with `{ items, total, page, pageSize }` unless the
 * request is "legacy shaped" (none of the params introduced by S08), in which
 * case it responds with the old bare array for one deprecation window.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const sp = req.nextUrl.searchParams;
  // A truly bare call (no params at all) gets the new paginated first page —
  // that's the whole point of S08 (see acceptance criteria). The
  // deprecation-window fallback below is for callers still passing the
  // *old* params (role/archived) without any of the new ones: recognizably
  // an un-migrated caller, not just a fresh "give me everything" request.
  const isLegacyRequest = sp.size > 0 && NEW_PARAMS.every((p) => !sp.has(p));

  const roleParam = sp.get("role");
  const roleFilter = roleParam
    ? roleParam
        .split(",")
        .map((r) => r.trim())
        .filter((r): r is UserRole => (ROLES as readonly string[]).includes(r))
    : null;

  const select = isStaff(me.role) ? STAFF_USER_SELECT : SLIM_USER_SELECT;

  // ?ids=a,b,c — point hydration for pickers (e.g. re-showing the name of an
  // already-selected user after reload). Bypasses every other filter: the
  // caller already knows which specific rows it wants.
  const idsParam = sp.get("ids");
  if (idsParam) {
    const ids = Array.from(
      new Set(
        idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    const items = ids.length
      ? await prisma.user.findMany({
          where: { id: { in: ids } },
          select,
          orderBy: { name: "asc" },
        })
      : [];
    return NextResponse.json({
      items: redactGradeForCaller(items, me),
      total: items.length,
      page: 1,
      pageSize: Math.max(items.length, 1),
    });
  }

  const where: Prisma.UserWhereInput = { isArchived: false };
  if (roleFilter && roleFilter.length > 0) {
    where.role = { in: roleFilter };
  }

  const archivedParam = sp.get("archived");
  const canSeeArchived = isStaff(me.role) && canManagePeople(me.role);
  if (archivedParam === "include" && canSeeArchived) {
    delete where.isArchived;
  } else if (archivedParam === "only" && canSeeArchived) {
    where.isArchived = true;
  }

  const managerId = sp.get("managerId");
  if (managerId) {
    where.managerId = managerId;
  }

  const q = sp.get("q")?.trim() ?? "";
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const departmentId = sp.get("department");
  if (departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { path: true },
    });
    if (!dept) {
      // Unknown unit — no rows can match rather than erroring the picker.
      return NextResponse.json({ items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });
    }
    const includeDescendants = sp.get("includeDescendants") !== "0";
    where.departments = includeDescendants
      ? {
          some: {
            department: {
              OR: [{ id: departmentId }, { path: { startsWith: `${dept.path}/` } }],
            },
          },
        }
      : { some: { departmentId } };
  }

  if (isLegacyRequest) {
    const items = await prisma.user.findMany({
      where,
      select,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(redactGradeForCaller(items, me), {
      headers: { Deprecation: "true" },
    });
  }

  const sortField = sp.get("sort") === "createdAt" ? "createdAt" : "name";
  const orderDir = sp.get("order") === "desc" ? "desc" : "asc";

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select,
      orderBy: { [sortField]: orderDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ items: redactGradeForCaller(items, me), total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createUserSchema);
  if (parsed.error) return parsed.error;
  const { name, email, role, grade, project, managerId } = parsed.data;

  if (!isEmailAllowed(email)) {
    return badRequest(
      `Only corporate emails are allowed (${allowedEmailDomains
        .map((d) => `@${d}`)
        .join(", ")})`
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return conflict("A user with this email already exists");

  let resolvedManagerId: string | null = null;
  if (managerId) {
    const candidate = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, role: true },
    });
    if (!candidate) return badRequest("Manager not found");
    if (!canManagePeople(candidate.role)) {
      return badRequest("Manager must have role MANAGER or ADMIN");
    }
    resolvedManagerId = candidate.id;
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: (role as UserRole | undefined) ?? "USER",
      grade: grade === "" ? null : grade ?? null,
      project: project ?? null,
      managerId: resolvedManagerId,
    },
    select: STAFF_USER_SELECT,
  });

  return NextResponse.json(user, { status: 201 });
}
