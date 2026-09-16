/**
 * Grant (or revoke) the super-admin flag for a user by email.
 *
 * Super admin gates HRM Sync + Departments on top of the ADMIN role — see
 * `isSuperAdmin()` in src/lib/roles.ts. It's a standalone `isSuperAdmin`
 * column, never touched by HRM sync, so this is the only way to set it.
 *
 * Usage:
 *   npx tsx scripts/grant-super-admin.ts <email> [--revoke]
 *
 * Safe to run against production (DATABASE_URL pointed at prod) as a one-off.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.find((a) => !a.startsWith("--"))?.toLowerCase().trim();

  if (!email) {
    console.error("Usage: tsx scripts/grant-super-admin.ts <email> [--revoke]");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(2);
  }
  if (user.role !== "ADMIN" && !revoke) {
    console.error(
      `${email} has role=${user.role}, not ADMIN. Super admin only takes effect for ADMIN users — ` +
        `grant ADMIN first (Users → edit role), then re-run this script.`
    );
    process.exit(3);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { isSuperAdmin: !revoke },
  });

  console.log(
    `${revoke ? "Revoked" : "Granted"} super admin for ${updated.email} ` +
      `(role=${updated.role}, isSuperAdmin=${updated.isSuperAdmin}).`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
