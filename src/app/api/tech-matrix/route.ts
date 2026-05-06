import { NextResponse } from "next/server";
import { loadTechMatrix } from "@/lib/data-loader";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound, serverError } from "@/lib/api-helpers";

export const runtime = "nodejs";
// Tech matrix is loaded from disk and never changes between deploys.
export const revalidate = 3600;

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const matrix = loadTechMatrix();
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("section");

    if (sectionId) {
      const section = matrix.sections.find((s) => s.id === sectionId);
      if (!section) return notFound("Section not found");
      return NextResponse.json(section, {
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    }

    return NextResponse.json(matrix, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
