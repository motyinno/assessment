import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { isEmailAllowed, allowedEmailDomains } from "@/lib/allowed-domains";
import { canManagePeople, isStaff, ROLES } from "@/lib/roles";
import { createUserSchema } from "@/lib/schemas";
import {
  badRequest,
  conflict,
  parseJsonBody,
} from "@/lib/api-helpers";
import type { UserRole } from "@prisma/client";

const STAFF_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  grade: true,
  project: true,
  managerId: true,
  manager: { select: { id: true, name: true, email: true } },
  createdAt: true,
} as const;

const SLIM_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} as const;

/**
 * GET /api/users
 * - Staff (ASSESSOR/MANAGER/ADMIN) get the full directory.
 * - Regular users get a slim payload (id, name, email, role) so combobox-style
 *   pickers in the UI keep working without leaking grade/project/manager.
 *
 * Optional ?role=A,B filters server-side so the frontend doesn't have to pull
 * the whole directory just to render an "assessor" dropdown.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const roleParam = req.nextUrl.searchParams.get("role");
  const roleFilter = roleParam
    ? roleParam
        .split(",")
        .map((r) => r.trim())
        .filter((r): r is UserRole => (ROLES as readonly string[]).includes(r))
    : null;

  const where: { role?: { in: UserRole[] } } = {};
  if (roleFilter && roleFilter.length > 0) {
    where.role = { in: roleFilter };
  }

  const select = isStaff(me.role) ? STAFF_USER_SELECT : SLIM_USER_SELECT;

  const users = await prisma.user.findMany({
    where,
    select,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
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
