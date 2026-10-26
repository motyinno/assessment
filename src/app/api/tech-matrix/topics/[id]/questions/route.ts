import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-helpers";
import { questionsForTopics } from "@/lib/question-bank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Questions asked at client interviews for one topic — the roadmap detail.
 * Readable by anyone signed in, like the matrix itself (it's preparation
 * material). `?band=` puts that level's questions first.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const band = new URL(req.url).searchParams.get("band");
  const map = await questionsForTopics([params.id], { band, perTopic: 12 });
  return NextResponse.json({ questions: map.get(params.id) ?? [] });
}
