/**
 * Seed MatrixSection / MatrixTopic from data/tech-matrix.json.
 *
 * Idempotent: upserts by the JSON's string ids and refreshes title/order/skills,
 * so re-running keeps the DB in sync with the seed file without duplicating rows
 * or losing referential keys (ids are preserved).
 *
 * Self-contained (only @prisma/client + node built-ins) so it runs both locally
 * (`npm run seed:matrix`) and inside the standalone Docker image, where the
 * `@/lib` path alias and src/ are unavailable. `data/` is copied into the image.
 *
 * Usage: npm run seed:matrix   |   docker compose exec app npm run seed:matrix
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

interface Topic {
  id: string;
  title: string;
  jun?: string[];
  mid?: string[];
  sen?: string[];
}
interface Section {
  id: string;
  title: string;
  topics: Topic[];
}

async function main() {
  const file = join(process.cwd(), "data", "tech-matrix.json");
  const matrix = JSON.parse(readFileSync(file, "utf-8")) as {
    sections: Section[];
  };

  let sectionCount = 0;
  let topicCount = 0;

  for (const [sIdx, section] of matrix.sections.entries()) {
    await prisma.matrixSection.upsert({
      where: { id: section.id },
      update: { title: section.title, order: sIdx },
      create: { id: section.id, title: section.title, order: sIdx },
    });
    sectionCount++;

    for (const [tIdx, topic] of section.topics.entries()) {
      await prisma.matrixTopic.upsert({
        where: { id: topic.id },
        update: {
          sectionId: section.id,
          title: topic.title,
          order: tIdx,
          jun: topic.jun ?? [],
          mid: topic.mid ?? [],
          sen: topic.sen ?? [],
        },
        create: {
          id: topic.id,
          sectionId: section.id,
          title: topic.title,
          order: tIdx,
          jun: topic.jun ?? [],
          mid: topic.mid ?? [],
          sen: topic.sen ?? [],
        },
      });
      topicCount++;
    }
  }

  console.log(
    `Tech matrix seeded: ${sectionCount} sections, ${topicCount} topics.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
