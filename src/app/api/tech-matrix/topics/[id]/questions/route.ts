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
  const sp = new URL(req.url).searchParams;
  const band = sp.get("band");
  // The roadmap shows a short list; the matrix dialog asks for all of them.
  const limit = Math.min(300, Math.max(1, Number(sp.get("limit")) || 12));
  const map = await questionsForTopics([params.id], { band, perTopic: limit });
  return NextResponse.json({ questions: map.get(params.id) ?? [] });
}
