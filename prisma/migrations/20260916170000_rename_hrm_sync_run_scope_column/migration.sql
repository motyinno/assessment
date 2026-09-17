-- The manual-sync department picker now selects live HRM org-unit ids
-- (numbers) rather than local Department.id's, so a fresh/empty local DB
-- can still scope a first sync. Rename the column to match.
ALTER TABLE "HrmSyncRun" RENAME COLUMN "scopedDepartmentIds" TO "scopedOrgUnitIds";
