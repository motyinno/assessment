-- CreateEnum
CREATE TYPE "AssessmentReviewStatus" AS ENUM ('NONE', 'PENDING', 'REVIEWED');

-- AlterTable
ALTER TABLE "Assessment" ADD COLUMN     "gradeUpgraded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "newGrade" TEXT,
ADD COLUMN     "previousGrade" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewStatus" "AssessmentReviewStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedForReviewAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Assessment_reviewStatus_idx" ON "Assessment"("reviewStatus");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
