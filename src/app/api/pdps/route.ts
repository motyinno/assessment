import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { isStaff } from "@/lib/roles";
import { getStaffDivisionScope, userInScopeWhere } from "@/lib/admin-scope";
import { SUBJECT_VISIBLE_STATUSES } from "@/lib/pdp-plan";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const scope = isStaff(me.role) ? await getStaffDivisionScope(me) : null;
  const where = isStaff(me.role)
    ? scope
      ? { user: userInScopeWhere(scope) }
      : {}
    : { userId: me.id, status: { in: [...SUBJECT_VISIBLE_STATUSES] } };

  const pdps = await prisma.pdp.findMany({
    where,
    include: {
      user: { select: { id: true, name: true } },
      assessment: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pdps);
}
