import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedUser = {
  name: string;
  email: string;
  role: "USER" | "ASSESSOR" | "ADMIN";
  grade: "jun" | "mid" | "sen" | null;
  project: string | null;
  manager: string | null;
};

const users: SeedUser[] = [
  {
    name: "Michael Shatilo",
    email: "mikhail.shatsila@innowise.com",
    role: "ADMIN",
    grade: "mid",
    project: null,
    manager: "Ilya Razuvaev",
  },
  {
    name: "Ilya Razuvaev",
    email: "ilya.razuvaev@innowise.com",
    role: "ASSESSOR",
    grade: "sen",
    project: "aveni",
    manager: "Nikita Verbovikov",
  },
  {
    name: "Anatolii Dalgou",
    email: "anatoli.dalgou@innowise.com",
    role: "ASSESSOR",
    grade: "mid",
    project: null,
    manager: "Darya Killiachecnko",
  },
  {
    name: "Darya Killiachecnko",
    email: "daria.killiachenko@innowise.com",
    role: "USER",
    grade: "mid",
    project: null,
    manager: "Ilya Razuvaev",
  },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        grade: u.grade,
        project: u.project,
        manager: u.manager,
      },
      create: u,
    });
  }
  console.log(`Seed completed: ${users.length} users upserted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
