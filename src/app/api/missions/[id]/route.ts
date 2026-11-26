import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { conflict, parseJsonBody } from "@/lib/api-helpers";
import { loadOwnMission } from "@/lib/mission-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.literal("drop") });

/** Drop the active mission; the coach then offers other topics. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { error, mission } = await loadOwnMission(params.id, auth.session.user.id);
  if (error) return error;
  const parsed = await parseJsonBody(req, schema);
  if (parsed.error) return parsed.error;

  const { count } = await prisma.techMission.updateMany({
    where: { id: mission.id, status: "ACTIVE" },
    data: { status: "DROPPED" },
  });
  if (!count) return conflict("This mission is no longer active");
  return new NextResponse(null, { status: 204 });
}
