import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { badRequest, forbidden, notFound, parseJsonBody } from "@/lib/api-helpers";

const bodySchema = z
  .object({
    done: z.boolean().optional(),
    link: z
      .string()
      .trim()
      .max(2000)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "Use a full http(s) link")
      .optional(),
  })
  .refine((v) => v.done !== undefined || v.link !== undefined, "Nothing to update");

/**
 * The employee ticks an item done (or not) and, for a practical task, attaches
 * a link to their work. Only while the plan is active — a completed plan is
 * frozen.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const me = auth.session.user;

  const item = await prisma.pdpItem.findUnique({
    where: { id: params.itemId },
    select: { id: true, goal: { select: { pdp: { select: { id: true, userId: true, status: true } } } } },
  });
  if (!item || item.goal.pdp.id !== params.id) return notFound("Item not found");
  if (item.goal.pdp.userId !== me.id) return forbidden("Only the plan's owner can mark progress");
  if (item.goal.pdp.status !== "ACTIVE") return badRequest("The plan isn't active");

  const parsed = await parseJsonBody(req, bodySchema);
  if (parsed.error) return parsed.error;
  const { done, link } = parsed.data;

  const updated = await prisma.pdpItem.update({
    where: { id: item.id },
    data: {
      ...(done !== undefined ? { doneAt: done ? new Date() : null } : {}),
      ...(link !== undefined ? { link: link || null } : {}),
    },
    select: { id: true, doneAt: true, link: true },
  });
  return NextResponse.json(updated);
}
