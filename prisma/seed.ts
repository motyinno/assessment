import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  // Admin
  await prisma.user.upsert({
    where: { email: "admin@pdp.local" },
    update: { role: "ADMIN" },
    create: {
      name: "Администратор",
      email: "admin@pdp.local",
      hashedPassword: await hash("admin123"),
      role: "ADMIN",
    },
  });

  // Assessor 1
  await prisma.user.upsert({
    where: { email: "assessor1@pdp.local" },
    update: {},
    create: {
      name: "Иванов Алексей",
      email: "assessor1@pdp.local",
      hashedPassword: await hash("assessor123"),
      role: "ASSESSOR",
      grade: "mid",
      project: "Platform",
    },
  });

  // Assessor 2
  await prisma.user.upsert({
    where: { email: "assessor2@pdp.local" },
    update: {},
    create: {
      name: "Петрова Мария",
      email: "assessor2@pdp.local",
      hashedPassword: await hash("assessor123"),
      role: "ASSESSOR",
      grade: "sen",
      project: "Core API",
    },
  });

  // User 1
  await prisma.user.upsert({
    where: { email: "user1@pdp.local" },
    update: {},
    create: {
      name: "Сидоров Дмитрий",
      email: "user1@pdp.local",
      hashedPassword: await hash("user123"),
      role: "USER",
      grade: "jun",
      project: "Frontend",
      manager: "Иванов Алексей",
    },
  });

  // User 2
  await prisma.user.upsert({
    where: { email: "user2@pdp.local" },
    update: {},
    create: {
      name: "Козлова Анна",
      email: "user2@pdp.local",
      hashedPassword: await hash("user123"),
      role: "USER",
      grade: "mid",
      project: "Backend",
      manager: "Петрова Мария",
    },
  });

  console.log("Seed completed:");
  console.log("  Admin:    admin@pdp.local / admin123");
  console.log("  Assessor: assessor1@pdp.local / assessor123");
  console.log("  Assessor: assessor2@pdp.local / assessor123");
  console.log("  User:     user1@pdp.local / user123");
  console.log("  User:     user2@pdp.local / user123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
