import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@test.local" },
    update: { role: "ADMIN" },
    create: { name: "Test Admin", email: "admin@test.local", role: "ADMIN" },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@test.local" },
    update: { role: "MANAGER" },
    create: { name: "Test Manager", email: "manager@test.local", role: "MANAGER" },
  });

  const employee = await prisma.user.upsert({
    where: { email: "dev@test.local" },
    update: { role: "USER", grade: "jun", project: "Test Project", managerId: manager.id },
    create: {
      name: "Test Employee",
      email: "dev@test.local",
      role: "USER",
      grade: "jun",
      project: "Test Project",
      managerId: manager.id,
    },
  });

  // Drop any prior test PDP so re-running is idempotent.
  await prisma.pdp.deleteMany({ where: { userId: employee.id, fileName: "Test PDP — Node.js.docx" } });

  const pdp = await prisma.pdp.create({
    data: {
      userId: employee.id,
      createdById: admin.id,
      fileName: "Test PDP — Node.js.docx",
      status: "ACTIVE", // already approved → checklist is workable
      driveLink: "https://docs.google.com/document/d/EXAMPLE/edit",
      topicsJson: [],
      items: {
        create: [
          { type: "THEORY", category: "Node.js Core", title: "Explain the event loop phases", order: 0, reviewerId: manager.id },
          { type: "THEORY", category: "Node.js Core", title: "How does streams backpressure work?", order: 1, reviewerId: manager.id },
          { type: "PRACTICE", category: "Node.js Core", title: "Implement a token-bucket rate limiter", order: 2, reviewerId: manager.id },
          { type: "THEORY", category: "Databases", title: "Compare optimistic vs pessimistic locking", order: 3, reviewerId: manager.id },
          { type: "PRACTICE", category: "Databases", title: "Write a migration with a zero-downtime column rename", order: 4, reviewerId: manager.id },
        ],
      },
    },
    include: { items: true },
  });

  console.log("Seeded test users (password: DEV_LOGIN_PASSWORD from .env.local):");
  console.log(`  admin@test.local    (ADMIN)`);
  console.log(`  manager@test.local  (MANAGER, reviewer)`);
  console.log(`  dev@test.local      (USER, employee — managed by manager@test.local)`);
  console.log(`\nActive PDP "${pdp.fileName}" with ${pdp.items.length} items for dev@test.local.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
