/**
 * Seed MatrixSection / MatrixTopic from data/tech-matrix.json.
 *
 * Idempotent: upserts by the JSON's string ids and refreshes title/order/skills,
 * so re-running keeps the DB in sync with the seed file without duplicating rows
 * or losing admin edits' referential keys (ids are preserved).
 *
 * Usage: npx tsx scripts/seed-tech-matrix.ts
 */
import { PrismaClient } from "@prisma/client";
import { loadTechMatrixFromFile } from "@/lib/data-loader";

const prisma = new PrismaClient();

async function main() {
  const matrix = loadTechMatrixFromFile();
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
