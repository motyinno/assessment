/**
 * Seed SessionTemplate rows from the original hardcoded session logic, so the
 * admin UI starts with the exact defaults that buildSessionsForGrade() used to
 * produce.
 *
 * Idempotent: upserts by (assessmentType, gradeBand, key). Re-running refreshes
 * title/order/duration for the default keys without touching admin-added rows.
 *
 * Usage: npx tsx scripts/seed-session-templates.ts
 */
import { PrismaClient } from "@prisma/client";
import { buildDefaultSessions } from "@/lib/assessment-sessions";

const prisma = new PrismaClient();

const GRADE_BANDS = ["jun", "mid", "sen"] as const;
const ASSESSMENT_TYPES = ["GENERAL", "PDP_CHECK"] as const;

async function main() {
  let count = 0;

  for (const assessmentType of ASSESSMENT_TYPES) {
    for (const gradeBand of GRADE_BANDS) {
      const templates = buildDefaultSessions(gradeBand, assessmentType);
      for (const t of templates) {
        await prisma.sessionTemplate.upsert({
          where: {
            assessmentType_gradeBand_key: {
              assessmentType,
              gradeBand,
              key: t.type,
            },
          },
          update: {
            title: t.title ?? t.type,
            order: t.order,
            durationMin: t.durationMin,
          },
          create: {
            assessmentType,
            gradeBand,
            key: t.type,
            title: t.title ?? t.type,
            order: t.order,
            durationMin: t.durationMin,
          },
        });
        count++;
      }
    }
  }

  console.log(`Session templates seeded: ${count} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
