import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdminScope } from "@/lib/auth-helpers";
import { userInScopeWhere } from "@/lib/admin-scope";

export async function GET() {
  const auth = await requireAdminScope();
  if (auth.error) return auth.error;
  const scope = auth.scope;
  if (scope && scope.size === 0) return NextResponse.json([]);

  const pdps = await prisma.pdp.findMany({
    where: {
      status: "ON_REVIEW",
      user: userInScopeWhere(scope),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      assessment: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pdps);
}
