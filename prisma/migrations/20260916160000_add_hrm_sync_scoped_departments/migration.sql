-- Department.id's a manual HRM sync run was scoped to (empty = full org sync).
ALTER TABLE "HrmSyncRun" ADD COLUMN "scopedDepartmentIds" TEXT[] NOT NULL DEFAULT '{}';
