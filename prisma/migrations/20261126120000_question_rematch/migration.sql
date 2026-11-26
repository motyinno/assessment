-- AlterTable
ALTER TABLE "InterviewQuestionImport" ADD COLUMN     "targetTopicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'IMPORT';

-- AlterTable
ALTER TABLE "InterviewQuestion" ADD COLUMN     "rematchId" TEXT;

-- CreateIndex
CREATE INDEX "InterviewQuestion_rematchId_idx" ON "InterviewQuestion"("rematchId");
