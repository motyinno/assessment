import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isStaff, canManagePeople } from "@/lib/roles";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function requireAssessor() {
  const { error, session } = await requireAuth();
  if (error) return { error, session: null };
  if (!isStaff(session!.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session: session! };
}

export async function requireManager() {
  const { error, session } = await requireAuth();
  if (error) return { error, session: null };
  if (!canManagePeople(session!.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session: session! };
}

export async function requireAdmin() {
  const { error, session } = await requireAuth();
  if (error) return { error, session: null };
  if (session!.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session: session! };
}
