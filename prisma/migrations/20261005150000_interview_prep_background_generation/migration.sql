-- AlterTable
ALTER TABLE "InterviewPrep" ADD COLUMN     "error" TEXT,
ADD COLUMN     "generationId" TEXT,
ADD COLUMN     "generationStartedAt" TIMESTAMP(3),
ADD COLUMN     "pendingTopicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'READY';
