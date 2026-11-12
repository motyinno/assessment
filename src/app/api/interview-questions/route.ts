import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { badRequest, conflict, parseJsonBody } from "@/lib/api-helpers";
import { BANDS, KINDS, divisionTopicIds, normalizeQuestion } from "@/lib/question-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * The division's question bank for the admin page. Filters: topicId
 * ("none" = unattached), kind, band, q (text search), hidden ("1" shows
 * hidden ones only). Most-asked first.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const sp = new URL(req.url).searchParams;
  const division = await resolveEditableDivision(auth.session.user, sp.get("departmentId"));
  if (division.error) return division.error;

  const topicId = sp.get("topicId");
  const kind = sp.get("kind");
  const band = sp.get("band");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const where: Prisma.InterviewQuestionWhereInput = {
    departmentId: division.departmentId,
    hidden: sp.get("hidden") === "1",
    ...(topicId === "none" ? { topicId: null } : topicId ? { topicId } : {}),
    ...(kind && (KINDS as readonly string[]).includes(kind) ? { kind: kind as (typeof KINDS)[number] } : {}),
    ...(band === "none" ? { band: null } : band && (BANDS as readonly string[]).includes(band) ? { band } : {}),
    ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.interviewQuestion.count({ where }),
    prisma.interviewQuestion.findMany({
      where,
      orderBy: [{ timesAsked: "desc" }, { createdAt: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, text: true, kind: true, band: true, topicId: true, proposedTopic: true, timesAsked: true, hidden: true },
    }),
  ]);
  return NextResponse.json({ items, total, page, pageSize: PAGE_SIZE });
}

const createSchema = z.object({
  departmentId: z.string().min(1).nullish(),
  text: z.string().trim().min(3).max(500),
  kind: z.enum(KINDS),
  topicId: z.string().min(1).nullish(),
  band: z.enum(BANDS).nullish(),
});

/** Add one question by hand (e.g. straight after an interview). */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = await parseJsonBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const { text, kind, topicId, band } = parsed.data;
  const division = await resolveEditableDivision(auth.session.user, parsed.data.departmentId);
  if (division.error) return division.error;
  if (topicId && !(await divisionTopicIds(division.departmentId)).has(topicId)) return badRequest("That topic isn't in this division's matrix");

  const normalized = normalizeQuestion(text);
  const dup = await prisma.interviewQuestion.findUnique({
    where: { departmentId_normalized: { departmentId: division.departmentId, normalized } },
    select: { id: true },
  });
  if (dup) return conflict("This question is already in the bank");
  const created = await prisma.interviewQuestion.create({
    data: { departmentId: division.departmentId, text, normalized, kind, topicId: topicId ?? null, band: band ?? null },
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
