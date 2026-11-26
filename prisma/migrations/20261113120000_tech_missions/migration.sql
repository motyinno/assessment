-- CreateTable
CREATE TABLE "TechMission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "skills" TEXT[],
    "reasons" JSONB NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TechMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechMissionCheck" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "verdicts" JSONB,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "TechMissionCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TechMission_userId_createdAt_idx" ON "TechMission"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TechMissionCheck_missionId_createdAt_idx" ON "TechMissionCheck"("missionId", "createdAt");

-- CreateIndex
CREATE INDEX "TechMissionCheck_userId_createdAt_idx" ON "TechMissionCheck"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TechMission" ADD CONSTRAINT "TechMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechMissionCheck" ADD CONSTRAINT "TechMissionCheck_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "TechMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechMissionCheck" ADD CONSTRAINT "TechMissionCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
