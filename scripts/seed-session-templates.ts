/**
 * Seed SessionTemplate rows with the original built-in session defaults, so the
 * admin UI starts with the exact sessions buildSessionsForGrade() used to
 * produce (GENERAL: 2 for jun, 3 for mid/sen; PDP_CHECK: 1 PDP review).
 *
 * Idempotent: upserts by (assessmentType, gradeBand, key). Re-running refreshes
 * title/order/duration for the default keys without touching admin-added rows.
 *
 * Self-contained (only @prisma/client) so it runs both locally and inside the
 * standalone Docker image.
 *
 * Usage: npm run seed:sessions   |   docker compose exec app npm run seed:sessions
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type AssessmentType = "GENERAL" | "PDP_CHECK";
type GradeBand = "jun" | "mid" | "sen";

interface TemplateRow {
  assessmentType: AssessmentType;
  gradeBand: GradeBand;
  key: string;
  title: string;
  order: number;
  durationMin: number;
}

const GENERAL_SESSIONS = [
  { key: "TECHNICAL_1", title: "Technical 1" },
  { key: "TECHNICAL_2", title: "Technical 2" },
  { key: "TECHNICAL_3", title: "Technical 3" },
];
// Junior gets 2 technical sessions; mid/sen get 3.
const GENERAL_COUNT: Record<GradeBand, number> = { jun: 2, mid: 3, sen: 3 };

function defaultRows(): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (const gradeBand of ["jun", "mid", "sen"] as GradeBand[]) {
    GENERAL_SESSIONS.slice(0, GENERAL_COUNT[gradeBand]).forEach((s, order) =>
      rows.push({
        assessmentType: "GENERAL",
        gradeBand,
        key: s.key,
        title: s.title,
        order,
        durationMin: 60,
      })
    );
    rows.push({
      assessmentType: "PDP_CHECK",
      gradeBand,
      key: "PDP_TECH",
      title: "PDP review",
      order: 0,
      durationMin: 60,
    });
  }
  return rows;
}

async function main() {
  let count = 0;
  for (const r of defaultRows()) {
    await prisma.sessionTemplate.upsert({
      where: {
        assessmentType_gradeBand_key: {
          assessmentType: r.assessmentType,
          gradeBand: r.gradeBand,
          key: r.key,
        },
      },
      update: { title: r.title, order: r.order, durationMin: r.durationMin },
      create: r,
    });
    count++;
  }
  console.log(`Session templates seeded: ${count} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
