import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/roles";
import { createRequestSchema } from "@/lib/schemas";
import {
  badRequest,
  conflict,
  parseJsonBody,
} from "@/lib/api-helpers";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const where = isAdmin(me.role) ? {} : { userId: me.id };

  const requests = await prisma.assessmentRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, grade: true } },
      assessors: {
        include: {
          assessor: { select: { id: true, name: true, email: true } },
        },
        orderBy: { isPrimary: "desc" },
      },
      assessment: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const parsed = await parseJsonBody(req, createRequestSchema);
  if (parsed.error) return parsed.error;
  const { notes } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { grade: true },
  });
  if (!user?.grade) {
    return badRequest("Your profile has no grade set. Contact an administrator.");
  }

  const existing = await prisma.assessmentRequest.findFirst({
    where: { userId: me.id, status: "PENDING" },
  });
  if (existing) return conflict("You already have a pending request");

  const request = await prisma.assessmentRequest.create({
    data: {
      userId: me.id,
      grade: user.grade,
      notes: notes ?? null,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(request, { status: 201 });
}
