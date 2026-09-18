-- The per-assessment guest override is gone: the people invited to assessment
-- calls are configured per division (Department.meetingGuestEmails) and that is
-- now the only source. No UI ever wrote this column and it is empty everywhere
-- it exists, so there is nothing to migrate out of it.
--
-- Only the intended statement is here: `prisma migrate diff` also emits a DROP
-- for the ahead-of-branch GradeAuditLog table in the shared dev database.

-- AlterTable
ALTER TABLE "Assessment" DROP COLUMN "optionalGuestEmail";
