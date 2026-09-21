-- One meeting guest per unit becomes a list. The scalar column shipped earlier
-- today and never reached production, but back it up into the array anyway so
-- any environment that did apply it keeps its value.
--
-- Only the additive/renaming statements are here: `prisma migrate diff` also
-- emits a DROP for the ahead-of-branch GradeAuditLog table that lives in the
-- shared dev database.

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "meetingGuestEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "Department"
SET "meetingGuestEmails" = ARRAY["meetingGuestEmail"]
WHERE "meetingGuestEmail" IS NOT NULL AND btrim("meetingGuestEmail") <> '';

ALTER TABLE "Department" DROP COLUMN "meetingGuestEmail";
