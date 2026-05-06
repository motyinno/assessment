-- =========================================================================
-- Overhaul: native enums, JSON columns, AssessmentRequest assessors join,
--           audit timestamps, Pdp indexes + startedAt, drop dead column.
-- =========================================================================

-- ---- Native enums --------------------------------------------------------

CREATE TYPE "UserRole" AS ENUM ('USER', 'ASSESSOR', 'MANAGER', 'ADMIN');
CREATE TYPE "AssessmentStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssessmentTypeEnum" AS ENUM ('GENERAL', 'PDP_CHECK');
CREATE TYPE "ParticipantRole" AS ENUM ('SUBJECT', 'ASSESSOR');
CREATE TYPE "SessionType" AS ENUM ('SOFT_AI', 'TECHNICAL_1', 'TECHNICAL_2', 'TECHNICAL_3', 'PDP_TECH');
CREATE TYPE "SessionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');
CREATE TYPE "PdpStatus" AS ENUM ('GENERATING', 'ON_REVIEW', 'DRAFT', 'ACTIVE', 'COMPLETED', 'FAILED');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Convert existing TEXT columns in place. The defaults must be dropped first
-- so the type change isn't blocked, then re-applied as enum literals.

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

ALTER TABLE "Assessment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Assessment"
  ALTER COLUMN "status" TYPE "AssessmentStatus" USING "status"::"AssessmentStatus";
ALTER TABLE "Assessment" ALTER COLUMN "status" SET DEFAULT 'PLANNED'::"AssessmentStatus";

ALTER TABLE "Assessment" ALTER COLUMN "assessmentType" DROP DEFAULT;
ALTER TABLE "Assessment"
  ALTER COLUMN "assessmentType" TYPE "AssessmentTypeEnum" USING "assessmentType"::"AssessmentTypeEnum";
ALTER TABLE "Assessment" ALTER COLUMN "assessmentType" SET DEFAULT 'GENERAL'::"AssessmentTypeEnum";

ALTER TABLE "AssessmentParticipant"
  ALTER COLUMN "participantRole" TYPE "ParticipantRole" USING "participantRole"::"ParticipantRole";

ALTER TABLE "AssessmentSession"
  ALTER COLUMN "type" TYPE "SessionType" USING "type"::"SessionType";

ALTER TABLE "AssessmentSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AssessmentSession"
  ALTER COLUMN "status" TYPE "SessionStatus" USING "status"::"SessionStatus";
ALTER TABLE "AssessmentSession" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED'::"SessionStatus";

ALTER TABLE "Pdp" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Pdp"
  ALTER COLUMN "status" TYPE "PdpStatus" USING "status"::"PdpStatus";
ALTER TABLE "Pdp" ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"PdpStatus";

ALTER TABLE "AssessmentRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AssessmentRequest"
  ALTER COLUMN "status" TYPE "RequestStatus" USING "status"::"RequestStatus";
ALTER TABLE "AssessmentRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"RequestStatus";

ALTER TABLE "AssessmentRequest" ALTER COLUMN "assessmentType" DROP DEFAULT;
ALTER TABLE "AssessmentRequest"
  ALTER COLUMN "assessmentType" TYPE "AssessmentTypeEnum" USING "assessmentType"::"AssessmentTypeEnum";
ALTER TABLE "AssessmentRequest" ALTER COLUMN "assessmentType" SET DEFAULT 'GENERAL'::"AssessmentTypeEnum";

-- ---- JSON columns --------------------------------------------------------
-- Cast existing JSON-as-string text into JSONB. Empty / NULL stays NULL.
-- For Pdp.topicsJson (NOT NULL), default any malformed value to '[]'.

ALTER TABLE "Assessment"
  ALTER COLUMN "pdpTopics" TYPE JSONB USING
    NULLIF("pdpTopics", '')::JSONB;

ALTER TABLE "AssessmentParticipant"
  ALTER COLUMN "assignedSections" TYPE JSONB USING
    NULLIF("assignedSections", '')::JSONB;

ALTER TABLE "AssessmentResult"
  ALTER COLUMN "subtopics" TYPE JSONB USING
    NULLIF("subtopics", '')::JSONB;

ALTER TABLE "Pdp"
  ALTER COLUMN "topicsJson" TYPE JSONB USING
    COALESCE(NULLIF("topicsJson", '')::JSONB, '[]'::JSONB);

-- ---- AssessmentRequest assessors → join table ---------------------------

CREATE TABLE "AssessmentRequestAssessor" (
  "id"         TEXT NOT NULL,
  "requestId"  TEXT NOT NULL,
  "assessorId" TEXT NOT NULL,
  "isPrimary"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentRequestAssessor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentRequestAssessor_requestId_assessorId_key"
  ON "AssessmentRequestAssessor"("requestId", "assessorId");

CREATE INDEX "AssessmentRequestAssessor_assessorId_idx"
  ON "AssessmentRequestAssessor"("assessorId");

ALTER TABLE "AssessmentRequestAssessor"
  ADD CONSTRAINT "AssessmentRequestAssessor_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "AssessmentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssessmentRequestAssessor"
  ADD CONSTRAINT "AssessmentRequestAssessor_assessorId_fkey"
  FOREIGN KEY ("assessorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from the legacy columns. We use gen_random_uuid() for the id since
-- the old data doesn't carry one; it will look slightly different from cuid()
-- IDs going forward but keys are opaque, so it's fine.
--
-- Source 1: assessorIds JSON array (preferred — lists every assessor).
INSERT INTO "AssessmentRequestAssessor" ("id", "requestId", "assessorId", "isPrimary", "createdAt")
SELECT
  REPLACE(gen_random_uuid()::text, '-', ''),
  r."id",
  elem.value::text,
  elem.ordinality = 1 AND r."assessorId" IS NULL OR elem.value::text = r."assessorId",
  r."createdAt"
FROM "AssessmentRequest" r,
     LATERAL jsonb_array_elements_text(
       CASE
         WHEN r."assessorIds" IS NULL OR r."assessorIds" = '' THEN '[]'::jsonb
         ELSE r."assessorIds"::jsonb
       END
     ) WITH ORDINALITY AS elem(value, ordinality)
WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."id" = elem.value::text)
ON CONFLICT ("requestId", "assessorId") DO NOTHING;

-- Source 2: legacy single assessorId for any rows that had no assessorIds JSON.
INSERT INTO "AssessmentRequestAssessor" ("id", "requestId", "assessorId", "isPrimary", "createdAt")
SELECT
  REPLACE(gen_random_uuid()::text, '-', ''),
  r."id",
  r."assessorId",
  true,
  r."createdAt"
FROM "AssessmentRequest" r
WHERE r."assessorId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = r."assessorId")
ON CONFLICT ("requestId", "assessorId") DO NOTHING;

-- Drop the legacy columns + their FK + index.
ALTER TABLE "AssessmentRequest" DROP CONSTRAINT IF EXISTS "AssessmentRequest_assessorId_fkey";
ALTER TABLE "AssessmentRequest" DROP COLUMN IF EXISTS "assessorId";
ALTER TABLE "AssessmentRequest" DROP COLUMN IF EXISTS "assessorIds";

-- ---- Audit timestamps + new columns -------------------------------------

ALTER TABLE "AssessmentParticipant"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AssessmentResult"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SelfAssessment"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pdp gets startedAt for the background-job reaper to know when generation
-- began. Default to now() so existing rows just look "started right now".
ALTER TABLE "Pdp"
  ADD COLUMN "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- New optional Calendar guest, per-assessment.
ALTER TABLE "Assessment"
  ADD COLUMN "optionalGuestEmail" TEXT;

-- ---- New indexes --------------------------------------------------------

CREATE INDEX IF NOT EXISTS "AssessmentParticipant_userId_idx"
  ON "AssessmentParticipant"("userId");

CREATE INDEX IF NOT EXISTS "Pdp_userId_idx" ON "Pdp"("userId");
CREATE INDEX IF NOT EXISTS "Pdp_assessmentId_idx" ON "Pdp"("assessmentId");
CREATE INDEX IF NOT EXISTS "Pdp_status_idx" ON "Pdp"("status");

-- ---- Drop dead column ---------------------------------------------------
-- hashedPassword was never read or written; the dev-credentials provider
-- compares against an env var, not this column.
ALTER TABLE "User" DROP COLUMN IF EXISTS "hashedPassword";
