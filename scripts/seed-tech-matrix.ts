/**
 * Seed MatrixSection / MatrixTopic from data/tech-matrix.json INTO ONE DIVISION.
 *
 * The matrix is per-division since the department-scoping change: `loadTechMatrix()`
 * queries `where: { departmentId }` with a concrete id, so a section left at
 * `departmentId: null` is invisible to every viewer — which is exactly what this
 * script used to produce. data/tech-matrix.json is the original, pre-scoping
 * matrix and it is the NodeJS one, hence the default below.
 *
 * Idempotent: upserts by the JSON's string ids and refreshes title/order/skills,
 * so re-running keeps the DB in sync with the seed file without duplicating rows
 * or losing referential keys (ids are preserved). Row ids are a GLOBAL primary
 * key (the admin editor collision-checks company-wide), so this file can only
 * ever back one division — seeding a second one from the same JSON aborts with
 * a clear message instead of silently stealing another division's sections.
 *
 * Self-contained (only @prisma/client + node built-ins) so it runs both locally
 * (`npm run seed:matrix`) and inside the standalone Docker image, where the
 * `@/lib` path alias and src/ are unavailable. `data/` is copied into the image.
 *
 * Usage:
 *   npm run seed:matrix                          # -> the "NodeJS" division
 *   npm run seed:matrix -- --division="Java"     # -> another division by name
 *   npm run seed:matrix -- --department-id=<id>  # -> by local Department id
 *
 * Requires the target Division to exist, i.e. HRM sync must have run at least
 * once (departments come from HRM, they are never created here).
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

const DEFAULT_DIVISION = "NodeJS";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length).trim() || undefined;
}

/** The Division this matrix belongs to. Never creates one — divisions come from HRM. */
async function resolveDepartmentId(): Promise<{ id: string; name: string }> {
  const explicitId = readArg("department-id");
  if (explicitId) {
    const dept = await prisma.department.findUnique({
      where: { id: explicitId },
      select: { id: true, name: true },
    });
    if (!dept) throw new Error(`No department with id "${explicitId}".`);
    return dept;
  }

  const name = readArg("division") ?? DEFAULT_DIVISION;
  const matches = await prisma.department.findMany({
    where: { typeName: "Division", isActive: true, name },
    select: { id: true, name: true },
  });
  if (matches.length === 1) return matches[0];

  const available = await prisma.department.findMany({
    where: { typeName: "Division", isActive: true },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  if (available.length === 0) {
    throw new Error(
      "No Division-type departments exist yet — run the HRM sync first (Admin -> HRM Sync -> Run now)."
    );
  }
  if (matches.length === 0) {
    throw new Error(
      `No active Division named "${name}". Available: ${available.map((d) => d.name).join(", ")}`
    );
  }
  throw new Error(
    `${matches.length} active Divisions are named "${name}" — pass --department-id=<id> to pick one.`
  );
}

async function main() {
  const department = await resolveDepartmentId();

  const file = join(process.cwd(), "data", "tech-matrix.json");
  const matrix = JSON.parse(readFileSync(file, "utf-8")) as {
    sections: Section[];
  };

  // Section ids are global. If they already belong to a different division,
  // stop: upserting would move that division's matrix over to this one.
  const clashes = await prisma.matrixSection.findMany({
    where: {
      id: { in: matrix.sections.map((s) => s.id) },
      departmentId: { not: department.id },
    },
    select: { id: true, departmentId: true },
  });
  if (clashes.length > 0) {
    throw new Error(
      `${clashes.length} section id(s) from data/tech-matrix.json already belong to another department ` +
        `(e.g. "${clashes[0].id}" -> ${clashes[0].departmentId}). This seed file can only back one division; ` +
        `build the other division's matrix in the admin editor instead.`
    );
  }

  let sectionCount = 0;
  let topicCount = 0;

  for (const [sIdx, section] of matrix.sections.entries()) {
    await prisma.matrixSection.upsert({
      where: { id: section.id },
      update: { title: section.title, order: sIdx, departmentId: department.id },
      create: { id: section.id, title: section.title, order: sIdx, departmentId: department.id },
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
    `Tech matrix seeded into division "${department.name}" (${department.id}): ` +
      `${sectionCount} sections, ${topicCount} topics.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
