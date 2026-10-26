-- Market sync: matrix proposals, matrix versions, trend tags.

CREATE TYPE "MatrixProposalKind" AS ENUM ('ADD_SECTION', 'ADD_TOPIC', 'ADD_QUESTIONS', 'REMOVE_TOPIC', 'REMOVE_QUESTIONS', 'TAG_HOT', 'TAG_COOLING');

CREATE TYPE "MatrixProposalState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'APPLIED', 'SKIPPED');

ALTER TABLE "MatrixTopic" ADD COLUMN     "trendTag" TEXT;

ALTER TABLE "SignalSource" ADD COLUMN     "proposalsError" TEXT,
ADD COLUMN     "proposalsGenerationId" TEXT,
ADD COLUMN     "proposalsStatus" TEXT;

CREATE TABLE "MatrixProposal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "kind" "MatrixProposalKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "sectionId" TEXT,
    "topicId" TEXT,
    "title" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "rationale" TEXT NOT NULL,
    "signalIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" "MatrixProposalState" NOT NULL DEFAULT 'PENDING',
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrixProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TechMatrixVersion" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sourceId" TEXT,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechMatrixVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatrixProposal_sourceId_idx" ON "MatrixProposal"("sourceId");

CREATE INDEX "MatrixProposal_departmentId_state_idx" ON "MatrixProposal"("departmentId", "state");

CREATE UNIQUE INDEX "TechMatrixVersion_departmentId_number_key" ON "TechMatrixVersion"("departmentId", "number");

ALTER TABLE "MatrixProposal" ADD CONSTRAINT "MatrixProposal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SignalSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatrixProposal" ADD CONSTRAINT "MatrixProposal_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "TechMatrixVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechMatrixVersion" ADD CONSTRAINT "TechMatrixVersion_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechMatrixVersion" ADD CONSTRAINT "TechMatrixVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SignalSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TechMatrixVersion" ADD CONSTRAINT "TechMatrixVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
