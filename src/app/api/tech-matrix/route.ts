import { NextResponse } from "next/server";
import { loadTechMatrix } from "@/lib/data-loader";

export async function GET(request: Request) {
  try {
    const matrix = loadTechMatrix();
    const { searchParams } = new URL(request.url);
    const sectionId = searchParams.get("section");

    if (sectionId) {
      const section = matrix.sections.find((s) => s.id === sectionId);
      if (!section) {
        return NextResponse.json({ error: "Section not found" }, { status: 404 });
      }
      return NextResponse.json(section);
    }

    return NextResponse.json(matrix);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
