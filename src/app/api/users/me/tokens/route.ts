import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireAuth, requireManager } from "@/lib/auth-helpers";
import { parseJsonBody } from "@/lib/api-helpers";
import { generateApiToken } from "@/lib/api-tokens";

export async function GET() {
  const a = await requireAuth();
  if (a.error) return a.error;

  const tokens = await prisma.apiToken.findMany({
    where: { userId: a.session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ tokens });
}

const CreateSchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().positive().max(3650).optional(),
});

export async function POST(req: Request) {
  // Only managers and admins may mint API tokens; everyone can still list/revoke
  // their own existing tokens above.
  const a = await requireManager();
  if (a.error) return a.error;

  const body = await parseJsonBody(req, CreateSchema);
  if (body.error) return body.error;

  const { token, hash, prefix } = generateApiToken();
  const expiresAt = body.data.expiresInDays
    ? new Date(Date.now() + body.data.expiresInDays * 86400_000)
    : null;

  const record = await prisma.apiToken.create({
    data: {
      userId: a.session.user.id,
      name: body.data.name,
      tokenHash: hash,
      tokenPrefix: prefix,
      expiresAt,
    },
    select: { id: true, name: true, tokenPrefix: true, expiresAt: true, createdAt: true },
  });

  // Raw token returned ONCE; never retrievable again.
  return NextResponse.json({ ...record, token }, { status: 201 });
}
