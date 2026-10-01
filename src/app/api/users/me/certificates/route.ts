import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { parseJsonBody, conflict, badRequest, errorJson } from "@/lib/api-helpers";
import { createCertificateSchema } from "@/lib/schemas";
import { certVerifyUrl, verifyCertificateExists } from "@/lib/certificates";

export async function GET() {
  const a = await requireAuth();
  if (a.error) return a.error;

  const rows = await prisma.certificate.findMany({
    where: { userId: a.session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, createdAt: true },
  });
  const certificates = rows.map((c) => ({ ...c, verifyUrl: certVerifyUrl(c.code) }));
  return NextResponse.json({ certificates });
}

export async function POST(req: Request) {
  const a = await requireAuth();
  if (a.error) return a.error;

  const body = await parseJsonBody(req, createCertificateSchema);
  if (body.error) return body.error;

  // Verify the code against the public registry before saving, so users can't
  // attach codes that don't exist.
  const verification = await verifyCertificateExists(body.data.code);
  if (!verification.ok) {
    if (verification.reason === "not_found") {
      return badRequest("This certificate does not exist");
    }
    return errorJson(
      "BAD_GATEWAY",
      "Couldn't verify the certificate right now. Please try again.",
      502
    );
  }

  try {
    const record = await prisma.certificate.create({
      data: { userId: a.session.user.id, code: body.data.code },
      select: { id: true, code: true, createdAt: true },
    });
    return NextResponse.json(
      { ...record, verifyUrl: certVerifyUrl(record.code) },
      { status: 201 }
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return conflict("You already added this certificate");
    }
    throw e;
  }
}
