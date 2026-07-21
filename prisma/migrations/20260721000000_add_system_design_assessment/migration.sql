-- AlterEnum: new assessment kind (single 1.5h system-design session, no tech matrix)
ALTER TYPE "AssessmentTypeEnum" ADD VALUE IF NOT EXISTS 'SYSTEM_DESIGN';

-- NOTE: AssessmentSession.type is a text column in this database (the legacy
-- "SessionType" enum was dropped by an earlier, ahead-of-branch migration), so
-- the new 'SYSTEM_DESIGN' session type needs no enum change — it is stored as a
-- plain string.

-- CreateTable: admin-curated pool of system-design problems
CREATE TABLE "SystemDesignTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemDesignTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable: which task(s) an assessor used in a given assessment
CREATE TABLE "AssessmentSystemDesignTask" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentSystemDesignTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemDesignTask_isArchived_idx" ON "SystemDesignTask"("isArchived");

-- CreateIndex
CREATE INDEX "AssessmentSystemDesignTask_taskId_idx" ON "AssessmentSystemDesignTask"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentSystemDesignTask_assessmentId_taskId_key" ON "AssessmentSystemDesignTask"("assessmentId", "taskId");

-- AddForeignKey
ALTER TABLE "AssessmentSystemDesignTask" ADD CONSTRAINT "AssessmentSystemDesignTask_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentSystemDesignTask" ADD CONSTRAINT "AssessmentSystemDesignTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SystemDesignTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
