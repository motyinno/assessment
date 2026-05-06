import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const pdps = await prisma.pdp.findMany({
    where: { status: "ON_REVIEW" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true, role: true } },
      assessment: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pdps);
}
