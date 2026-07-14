-- Editable tech matrix + admin-managed session templates.

-- 1. AssessmentSession.type: enum -> free-form text (admins can define
--    arbitrary session kinds). The existing unique index on
--    (assessmentId, type) is preserved through the in-place type change.
ALTER TABLE "AssessmentSession" ALTER COLUMN "type" TYPE TEXT USING ("type"::text);
DROP TYPE "SessionType";

-- 2. Denormalized display name captured from the template at creation time.
ALTER TABLE "AssessmentSession" ADD COLUMN "title" TEXT;

-- 3. Global session templates (drive buildSessionsForGrade).
CREATE TABLE "SessionTemplate" (
    "id" TEXT NOT NULL,
    "assessmentType" "AssessmentTypeEnum" NOT NULL,
    "gradeBand" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SessionTemplate_assessmentType_gradeBand_idx" ON "SessionTemplate"("assessmentType", "gradeBand");
CREATE UNIQUE INDEX "SessionTemplate_assessmentType_gradeBand_key_key" ON "SessionTemplate"("assessmentType", "gradeBand", "key");

-- 4. Editable technical matrix.
CREATE TABLE "MatrixSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrixSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MatrixTopic" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "jun" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sen" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatrixTopic_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatrixTopic_sectionId_idx" ON "MatrixTopic"("sectionId");
ALTER TABLE "MatrixTopic" ADD CONSTRAINT "MatrixTopic_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "MatrixSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
