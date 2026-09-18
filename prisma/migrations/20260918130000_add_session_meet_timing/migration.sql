-- Measured conference start/end pulled from the Meet API, kept alongside the
-- workflow's own startedAt/completedAt. Only the additive statements from
-- `prisma migrate diff` are kept — it also emits DROPs for the ahead-of-branch
-- GradeAuditLog table that lives in the shared dev database.

-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "meetEndedAt" TIMESTAMP(3),
ADD COLUMN     "meetStartedAt" TIMESTAMP(3);
