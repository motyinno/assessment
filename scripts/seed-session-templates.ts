/**
 * Seed SessionTemplate rows with the original built-in session defaults, so the
 * admin UI starts with the exact sessions buildSessionsForGrade() used to
 * produce (GENERAL: 2 for jun, 3 for mid/sen; PDP_CHECK: 1 PDP review).
 *
 * Seeds INTO ONE DIVISION, same as scripts/seed-tech-matrix.ts and for the same
 * reason: `buildSessionsForGrade()` only reads rows with a concrete
 * `departmentId`, so rows left at `departmentId: null` are read by nobody and
 * can be edited by nobody but a super-admin. (The app does still work without
 * them — it falls back to buildDefaultSessions() in code — but the admin UI at
 * /session-templates shows the division empty.)
 *
 * Idempotent: upserts by (departmentId, assessmentType, gradeBand, key).
 * Re-running refreshes title/order/duration for the default keys without
 * touching admin-added rows.
 *
 * Self-contained (only @prisma/client) so it runs both locally and inside the
 * standalone Docker image.
 *
 * Usage:
 *   npm run seed:sessions                          # -> the "NodeJS" division
 *   npm run seed:sessions -- --division="Java"
 *   npm run seed:sessions -- --department-id=<id>
 *
 * Requires the target Division to exist, i.e. HRM sync must have run at least once.
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

const DEFAULT_DIVISION = "NodeJS";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit?.slice(prefix.length).trim() || undefined;
}

/** The Division these templates belong to. Never creates one — divisions come from HRM. */
async function resolveDepartment(): Promise<{ id: string; name: string }> {
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
  const department = await resolveDepartment();

  let count = 0;
  for (const r of defaultRows()) {
    await prisma.sessionTemplate.upsert({
      where: {
        departmentId_assessmentType_gradeBand_key: {
          departmentId: department.id,
          assessmentType: r.assessmentType,
          gradeBand: r.gradeBand,
          key: r.key,
        },
      },
      update: { title: r.title, order: r.order, durationMin: r.durationMin },
      create: { ...r, departmentId: department.id },
    });
    count++;
  }
  console.log(
    `Session templates seeded into division "${department.name}" (${department.id}): ${count} rows.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
