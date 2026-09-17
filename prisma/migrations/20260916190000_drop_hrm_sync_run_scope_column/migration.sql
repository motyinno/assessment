-- Reverting the "selectable departments in HRM sync" feature — back to
-- always syncing the whole org at once.
ALTER TABLE "HrmSyncRun" DROP COLUMN "scopedOrgUnitIds";
