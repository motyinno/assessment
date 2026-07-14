import { NextResponse } from "next/server";
import { loadTechMatrix } from "@/lib/data-loader";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound, serverError } from "@/lib/api-helpers";

export const runtime = "nodejs";
// The matrix is now admin-editable and DB-backed, so it must not be cached.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const matrix = await loadTechMatrix();
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("section");

    if (sectionId) {
      const section = matrix.sections.find((s) => s.id === sectionId);
      if (!section) return notFound("Section not found");
      return NextResponse.json(section);
    }

    return NextResponse.json(matrix);
  } catch (e) {
    return serverError(e instanceof Error ? e.message : String(e));
  }
}
