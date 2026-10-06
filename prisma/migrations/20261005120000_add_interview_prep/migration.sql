-- CreateTable
CREATE TABLE "InterviewPrep" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "assessorId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "topicIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPrep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewPrep_assessmentId_assessorId_key" ON "InterviewPrep"("assessmentId", "assessorId");

-- AddForeignKey
ALTER TABLE "InterviewPrep" ADD CONSTRAINT "InterviewPrep_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewPrep" ADD CONSTRAINT "InterviewPrep_assessorId_fkey" FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
