-- Interview question bank.

CREATE TYPE "InterviewQuestionKind" AS ENUM ('THEORY', 'EXPERIENCE', 'BEHAVIORAL', 'BACKGROUND');

CREATE TABLE "InterviewQuestion" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "topicId" TEXT,
    "band" TEXT,
    "kind" "InterviewQuestionKind" NOT NULL,
    "text" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "timesAsked" INTEGER NOT NULL DEFAULT 1,
    "proposedTopic" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewQuestionImport" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestionImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewQuestion_departmentId_topicId_idx" ON "InterviewQuestion"("departmentId", "topicId");

CREATE UNIQUE INDEX "InterviewQuestion_departmentId_normalized_key" ON "InterviewQuestion"("departmentId", "normalized");

ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_importId_fkey" FOREIGN KEY ("importId") REFERENCES "InterviewQuestionImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestionImport" ADD CONSTRAINT "InterviewQuestionImport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestionImport" ADD CONSTRAINT "InterviewQuestionImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
