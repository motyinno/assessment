/**
 * LOCAL DEV HELPER — not meant for production deploys.
 *
 * Creates (or resets) one throwaway subject and one assessment with you as the
 * assessor, so the Meet flow can be exercised end to end: schedule the meeting,
 * hold the call, then Complete and watch the recording + measured duration land
 * on the session.
 *
 * Re-running it is safe and is the way to start a fresh run: the assessment is
 * rewound to PLANNED with every session back to NOT_STARTED and all meeting /
 * recording / timing fields cleared.
 *
 *   npx tsx scripts/seed-test-assessment.ts [assessor-email] [label]
 *
 * A `label` gives the run its own assessment instead of rewinding the default
 * one, so an earlier run can be kept around for comparison.
 */
import prisma from "@/lib/prisma";
import { buildSessionsForGrade } from "@/lib/assessment-sessions";
import { resolveUserDivision } from "@/lib/user-division";

const DEFAULT_ASSESSOR = "mikhail.shatsila@innowise.com";
// Deliberately a non-deliverable address: scheduling the meeting sends a real
// Calendar invite to the subject, and a test run must not land in a colleague's
// inbox.
const SUBJECT_EMAIL = "test-subject@test.dev";
const BASE_TITLE = "[test] Meet flow check";
const GRADE = "mid";

async function main() {
  // `||`, not `??`: an empty argument should fall back too.
  const assessorEmail = process.argv[2]?.trim() || DEFAULT_ASSESSOR;
  const label = process.argv[3]?.trim();
  const title = label ? `${BASE_TITLE} — ${label}` : BASE_TITLE;

  const assessor = await prisma.user.findUnique({ where: { email: assessorEmail } });
  if (!assessor) throw new Error(`No user with email ${assessorEmail} in this database`);

  // The subject sits in the assessor's own division so the tech matrix, the
  // session templates and the new per-department meeting guest all resolve the
  // same way they would for a real person.
  const divisionId = assessor.divisionId;

  const subject = await prisma.user.upsert({
    where: { email: SUBJECT_EMAIL },
    update: { name: "Test Subject", grade: GRADE, divisionId, isArchived: false },
    create: {
      name: "Test Subject",
      email: SUBJECT_EMAIL,
      role: "USER",
      grade: GRADE,
      divisionId,
      jobTitle: "Node.js Developer",
    },
  });

  if (divisionId) {
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId: subject.id, departmentId: divisionId } },
      update: {},
      create: { userId: subject.id, departmentId: divisionId },
    });
  }

  const existing = await prisma.assessment.findFirst({
    where: { title, participants: { some: { userId: subject.id } } },
  });

  if (existing) {
    // Rewind rather than pile up a second assessment on every run.
    await prisma.assessmentSession.updateMany({
      where: { assessmentId: existing.id },
      data: {
        status: "NOT_STARTED",
        startedAt: null,
        completedAt: null,
        notes: null,
        assessorId: null,
        assessorName: null,
        meetingLink: null,
        calendarEventId: null,
        meetingScheduledAt: null,
        recordingLink: null,
        recordingFileId: null,
        meetStartedAt: null,
        meetEndedAt: null,
      },
    });
    await prisma.assessment.update({
      where: { id: existing.id },
      data: { status: "PLANNED", completedAt: null, reviewStatus: "NONE", aiFeedback: null },
    });
    report(existing.id, subject.email, assessorEmail, "reset");
    return;
  }

  const assessment = await prisma.assessment.create({
    data: {
      title,
      grade: GRADE,
      status: "PLANNED",
      participants: {
        create: [
          { userId: subject.id, participantRole: "SUBJECT" },
          { userId: assessor.id, participantRole: "ASSESSOR" },
        ],
      },
    },
  });

  // Same call the real "create sessions" endpoint makes, so the fixture gets
  // whatever the division's session templates say (or the built-in defaults).
  const division = await resolveUserDivision(subject.id);
  const templates = await buildSessionsForGrade(GRADE, "GENERAL", division?.id ?? null);
  await prisma.assessmentSession.createMany({
    data: templates.map((t) => ({
      assessmentId: assessment.id,
      type: t.type,
      title: t.title,
      status: t.status as never,
      order: t.order,
      durationMin: t.durationMin,
    })),
  });

  report(assessment.id, subject.email, assessorEmail, "created");
}

function report(id: string, subjectEmail: string, assessorEmail: string, what: string) {
  console.log(`Assessment ${what}: http://localhost:3000/assessments/${id}`);
  console.log(`  subject:  ${subjectEmail} (invites to it go nowhere, by design)`);
  console.log(`  assessor: ${assessorEmail}`);
}

main().finally(() => prisma.$disconnect());
