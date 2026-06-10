-- Remove the "Soft + AI" assessment stage entirely. Only technical sessions remain.

-- 1. Drop any existing Soft+AI session rows so the enum value can be removed.
DELETE FROM "AssessmentSession" WHERE "type" = 'SOFT_AI';

-- 2. Narrow the SessionType enum (drop SOFT_AI).
BEGIN;
CREATE TYPE "SessionType_new" AS ENUM ('TECHNICAL_1', 'TECHNICAL_2', 'TECHNICAL_3', 'PDP_TECH');
ALTER TABLE "AssessmentSession" ALTER COLUMN "type" TYPE "SessionType_new" USING ("type"::text::"SessionType_new");
ALTER TYPE "SessionType" RENAME TO "SessionType_old";
ALTER TYPE "SessionType_new" RENAME TO "SessionType";
DROP TYPE "SessionType_old";
COMMIT;

-- 3. Drop the now-unused soft-AI flag from User.
ALTER TABLE "User" DROP COLUMN "softAiInterviewPassed";
