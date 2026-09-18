-- Per-unit optional meeting guest (app-owned column; the HRM sync never
-- writes it). Only the additive statement from `prisma migrate diff` is kept
-- here on purpose — the diff also emits DROPs for the ahead-of-branch
-- GradeAuditLog table that lives in the shared dev database.

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "meetingGuestEmail" TEXT;
