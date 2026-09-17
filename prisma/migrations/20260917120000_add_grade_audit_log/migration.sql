-- CreateTable
CREATE TABLE "GradeAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousGrade" TEXT,
    "newGrade" TEXT,
    "source" TEXT NOT NULL,
    "assessmentId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeAuditLog_userId_createdAt_idx" ON "GradeAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GradeAuditLog_assessmentId_idx" ON "GradeAuditLog"("assessmentId");

-- AddForeignKey
ALTER TABLE "GradeAuditLog" ADD CONSTRAINT "GradeAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeAuditLog" ADD CONSTRAINT "GradeAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeAuditLog" ADD CONSTRAINT "GradeAuditLog_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every historical grade upgrade already recorded on Assessment
-- (previousGrade / newGrade / reviewedAt are written by the admin review
-- decision in app/api/assessment-review/[id]). Without this the timeline would
-- start empty for everyone who was already promoted through the app.
--
-- `actorId` is the reviewing admin where one is recorded. Rows where the grade
-- did not actually change are skipped — they carry no growth information.
INSERT INTO "GradeAuditLog" ("id", "userId", "previousGrade", "newGrade", "source", "assessmentId", "actorId", "note", "createdAt")
SELECT
    gen_random_uuid()::text,
    p."userId",
    a."previousGrade",
    a."newGrade",
    'ASSESSMENT',
    a."id",
    a."reviewedById",
    a."reviewNotes",
    COALESCE(a."reviewedAt", a."completedAt", a."updatedAt")
FROM "Assessment" a
JOIN "AssessmentParticipant" p
    ON p."assessmentId" = a."id"
   AND p."participantRole" = 'SUBJECT'
WHERE a."gradeUpgraded" = true
  AND a."reviewStatus" = 'REVIEWED'
  AND a."newGrade" IS NOT NULL
  AND a."previousGrade" IS DISTINCT FROM a."newGrade";
