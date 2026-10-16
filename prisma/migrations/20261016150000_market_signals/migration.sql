-- Market signals: sources, extracted signals, and the basis of a PDP.

CREATE TYPE "SignalSourceType" AS ENUM ('MARKET_REPORT');

CREATE TYPE "SignalSourceStatus" AS ENUM ('PROCESSING', 'FAILED', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "SignalMappingState" AS ENUM ('UNMAPPED', 'MAPPED', 'PROPOSAL', 'OUT_OF_SCOPE');

ALTER TABLE "Pdp" ADD COLUMN     "basis" JSONB;

ALTER TABLE "PdpGoal" ADD COLUMN     "fitScore" DOUBLE PRECISION,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "signalIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "SignalSource" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "type" "SignalSourceType" NOT NULL DEFAULT 'MARKET_REPORT',
    "title" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "format" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "status" "SignalSourceStatus" NOT NULL DEFAULT 'PROCESSING',
    "error" TEXT,
    "generationId" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "share" DOUBLE PRECISION,
    "baseline" DOUBLE PRECISION,
    "sampleN" INTEGER,
    "levelHint" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "mappingState" "SignalMappingState" NOT NULL DEFAULT 'UNMAPPED',
    "topicId" TEXT,
    "match" TEXT,
    "mappedBy" TEXT,
    "rationale" TEXT,
    "proposedTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignalSource_departmentId_status_idx" ON "SignalSource"("departmentId", "status");

CREATE INDEX "Signal_sourceId_idx" ON "Signal"("sourceId");

ALTER TABLE "SignalSource" ADD CONSTRAINT "SignalSource_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SignalSource" ADD CONSTRAINT "SignalSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Signal" ADD CONSTRAINT "Signal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SignalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
