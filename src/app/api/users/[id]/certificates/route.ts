import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { notFound, forbidden } from "@/lib/api-helpers";
import { isStaff } from "@/lib/roles";
import { certVerifyUrl, verifyCertificateExists } from "@/lib/certificates";

export const runtime = "nodejs";

/**
 * Read a user's *pinned* certificates. Restricted to those who can view the
 * user's profile — staff (assessor/manager/admin) or the user themselves.
 * Only pinned certificates are exposed; unpinned ones stay private to the
 * owner. Each is checked live against the public registry for current
 * validity + details.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const me = auth.session.user;
  if (!isStaff(me.role) && me.id !== id) return forbidden();

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!user) return notFound("User not found");

  const rows = await prisma.certificate.findMany({
    where: { userId: id, pinned: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, createdAt: true },
  });

  // Verify each against the registry in parallel; degrade gracefully if the
  // registry is slow/down (status "unavailable") rather than failing the page.
  const certificates = await Promise.all(
    rows.map(async (c) => {
      const result = await verifyCertificateExists(c.code);
      const status = result.ok
        ? "valid"
        : result.reason === "not_found"
          ? "not_found"
          : "unavailable";
      return {
        id: c.id,
        code: c.code,
        createdAt: c.createdAt,
        verifyUrl: certVerifyUrl(c.code),
        status,
        details: result.ok ? result.data : null,
      };
    })
  );

  return NextResponse.json({ certificates });
}
