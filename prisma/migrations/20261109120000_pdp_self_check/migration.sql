-- CreateTable
CREATE TABLE "PdpSelfCheck" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "verdicts" JSONB,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "PdpSelfCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdpSelfCheck_goalId_userId_createdAt_idx" ON "PdpSelfCheck"("goalId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PdpSelfCheck" ADD CONSTRAINT "PdpSelfCheck_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PdpGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpSelfCheck" ADD CONSTRAINT "PdpSelfCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
