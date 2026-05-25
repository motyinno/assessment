/**
 * Issue an API token for a user.
 *
 * Usage:
 *   npx tsx scripts/issue-token.ts <email> [token-name] [--expires-days N]
 *
 * Prints the raw token ONCE to stdout. Only the SHA-256 hash is stored.
 */
import { PrismaClient } from "@prisma/client";
import { generateApiToken } from "@/lib/api-tokens";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: tsx scripts/issue-token.ts <email> [name] [--expires-days N]");
    process.exit(1);
  }
  const email = args[0].toLowerCase().trim();
  let name = "cli-issued";
  let expiresDays: number | null = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--expires-days") {
      expiresDays = Number(args[++i]);
    } else {
      name = args[i];
    }
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(2);
  }

  const { token, hash, prefix } = generateApiToken();
  const expiresAt =
    expiresDays && expiresDays > 0
      ? new Date(Date.now() + expiresDays * 86400_000)
      : null;

  await prisma.apiToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash: hash,
      tokenPrefix: prefix,
      expiresAt,
    },
  });

  console.log("\nAPI token issued. Save it now — it will not be shown again.\n");
  console.log(`  user:    ${user.email} (role=${user.role})`);
  console.log(`  name:    ${name}`);
  console.log(`  expires: ${expiresAt ? expiresAt.toISOString() : "never"}`);
  console.log(`\n  token:   ${token}\n`);
  console.log("Use it as:");
  console.log(`  curl -H 'Authorization: Bearer ${token}' http://localhost:3000/api/users/me\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
