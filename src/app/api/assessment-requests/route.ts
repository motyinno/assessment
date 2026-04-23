import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const role = session!.user.role;
  const where = role === "ADMIN" ? {} : { userId: session!.user.id };

  const requests = await prisma.assessmentRequest.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, grade: true } },
      assessor: { select: { id: true, name: true, email: true } },
      assessment: { select: { id: true, title: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { notes } = body;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { grade: true },
  });

  if (!user?.grade) {
    return NextResponse.json(
      { error: "В вашем профиле не указан грейд. Обратитесь к администратору." },
      { status: 400 }
    );
  }

  // Check for existing pending request
  const existing = await prisma.assessmentRequest.findFirst({
    where: { userId: session!.user.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "У вас уже есть активная заявка на рассмотрении" },
      { status: 400 }
    );
  }

  const request = await prisma.assessmentRequest.create({
    data: {
      userId: session!.user.id,
      grade: user.grade,
      notes,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(request, { status: 201 });
}
