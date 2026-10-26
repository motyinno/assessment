import type { Session } from "next-auth";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { assertCanEditDivision } from "@/lib/user-division";
import { notFound } from "@/lib/api-helpers";
import { sourceInclude } from "@/lib/market-signals";

type Source = NonNullable<Awaited<ReturnType<typeof findSource>>>;

const findSource = (id: string) => prisma.signalSource.findUnique({ where: { id }, include: sourceInclude });

/**
 * An admin acting on a signal source of a division they may edit (their own;
 * any for a super-admin) — same rule as the tech-matrix editor.
 */
export async function requireSourceAdmin(
  sourceId: string
): Promise<{ error: Response; session: null; source: null } | { error: null; session: Session; source: Source }> {
  const auth = await requireAdmin();
  if (auth.error) return { error: auth.error, session: null, source: null };
  const source = await findSource(sourceId);
  if (!source) return { error: notFound("Source not found"), session: null, source: null };
  const scopeError = await assertCanEditDivision(auth.session.user, source.departmentId);
  if (scopeError) return { error: scopeError, session: null, source: null };
  return { error: null, session: auth.session, source };
}
