import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { createTopicSchema } from "@/lib/schemas";
import { badRequest, parseJsonBody } from "@/lib/api-helpers";
import { uniqueSlug } from "@/lib/slug";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createTopicSchema);
  if (parsed.error) return parsed.error;
  const { sectionId, title } = parsed.data;

  const section = await prisma.matrixSection.findUnique({
    where: { id: sectionId },
    include: { topics: { select: { id: true } } },
  });
  if (!section) return badRequest("Section not found");

  // Topic ids are unique globally (primary key), so guard against collisions
  // across the whole matrix, not just within the section.
  const allTopics = await prisma.matrixTopic.findMany({ select: { id: true } });
  const taken = new Set(allTopics.map((t) => t.id));
  const id = uniqueSlug(title, taken);
  const order = section.topics.length;

  const topic = await prisma.matrixTopic.create({
    data: { id, sectionId, title, order, jun: [], mid: [], sen: [] },
  });
  return NextResponse.json(topic, { status: 201 });
}
