import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { resolveEditableDivision } from "@/lib/user-division";
import { badRequest } from "@/lib/api-helpers";
import { importQuestions, questionImportSchema } from "@/lib/question-bank";

export const runtime = "nodejs";

/**
 * Import an interview-questions/v1 JSON into the division's bank. Body:
 * `{ departmentId?, payload }` — payload is the file as uploaded. Repeats
 * merge into existing questions (timesAsked adds up).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  let body: { departmentId?: string | null; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const division = await resolveEditableDivision(auth.session.user, body.departmentId);
  if (division.error) return division.error;
  const parsed = questionImportSchema.safeParse(body.payload);
  if (!parsed.success) {
    return badRequest(
      "The file doesn't match interview-questions/v1",
      parsed.error.issues.slice(0, 15).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    );
  }
  const result = await importQuestions({ departmentId: division.departmentId, payload: parsed.data, createdById: auth.session.user.id });
  return NextResponse.json(result, { status: 201 });
}
