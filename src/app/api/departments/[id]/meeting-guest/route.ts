import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { forbidden, notFound, parseJsonBody, unauthorized } from "@/lib/api-helpers";
import { canConfigureDepartment } from "@/lib/admin-scope";
import { normalizeGuestList, resolveInheritedMeetingGuests } from "@/lib/meeting-guest";
import { patchDepartmentSchema } from "@/lib/schemas";

/**
 * A department's meeting guests — the people auto-invited to every assessment
 * call of that unit's people. Its own tiny endpoint rather than a field on
 * /api/departments/[id]: that route builds a whole unit card (every department
 * plus every membership, for the headcounts) and this is a single string, read
 * on every render of the assessment-configuration screen.
 *
 * Both verbs are gated by `canConfigureDepartment`: a super-admin anywhere, a
 * plain ADMIN inside their own units and the sub-units beneath them.
 */
async function guard(departmentId: string) {
  const session = await auth();
  if (!session?.user) return { error: unauthorized() };
  if (!(await canConfigureDepartment(session.user, departmentId))) {
    return { error: forbidden() };
  }
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { isActive: true },
  });
  if (!department?.isActive) return { error: notFound("Department not found") };
  return { error: null };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;

  const [department, inherited] = await Promise.all([
    prisma.department.findUnique({
      where: { id: params.id },
      select: { meetingGuestEmails: true },
    }),
    resolveInheritedMeetingGuests(params.id),
  ]);

  return NextResponse.json({
    meetingGuestEmails: normalizeGuestList(department?.meetingGuestEmails ?? []),
    // What this unit falls back to today, so the screen can show it as the hint.
    inherited,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(params.id);
  if (g.error) return g.error;

  const parsed = await parseJsonBody(req, patchDepartmentSchema);
  if (parsed.error) return parsed.error;
  const { meetingGuestEmails } = parsed.data;
  if (meetingGuestEmails === undefined) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Nothing to update" } }, { status: 400 });
  }

  const updated = await prisma.department.update({
    where: { id: params.id },
    // The client always sends the whole list, so an empty one clears it.
    // Normalized here as well as in the browser: the API is reachable directly.
    data: { meetingGuestEmails: normalizeGuestList(meetingGuestEmails) },
    select: { meetingGuestEmails: true },
  });

  return NextResponse.json(updated);
}
