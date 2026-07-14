import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { createSessionTemplateSchema } from "@/lib/schemas";
import { badRequest, conflict, parseJsonBody } from "@/lib/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slugify a title into a stable session-type key, e.g. "Technical 1" -> "TECHNICAL_1". */
function slugifyKey(title: string): string {
  return (
    title
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "SESSION"
  );
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const templates = await prisma.sessionTemplate.findMany({
    orderBy: [
      { assessmentType: "asc" },
      { gradeBand: "asc" },
      { order: "asc" },
    ],
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = await parseJsonBody(req, createSessionTemplateSchema);
  if (parsed.error) return parsed.error;
  const { assessmentType, gradeBand, title, order, durationMin, enabled } =
    parsed.data;
  const key = parsed.data.key?.trim() || slugifyKey(title);

  try {
    const created = await prisma.sessionTemplate.create({
      data: {
        assessmentType,
        gradeBand,
        key,
        title,
        order,
        durationMin,
        enabled: enabled ?? true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return conflict(
        "A session with this key already exists for that grade band and type"
      );
    }
    return badRequest("Failed to create session template");
  }
}
