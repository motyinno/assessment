-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hrmDismissed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hrmEmployeeId" INTEGER,
ADD COLUMN     "hrmManagerId" INTEGER,
ADD COLUMN     "hrmSyncedAt" TIMESTAMP(3),
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "photoFileName" TEXT,
ADD COLUMN     "projects" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: copy the legacy scalar `project` into the new `projects` array so
-- existing data isn't lost. The legacy column stays; sync only writes `projects`
-- going forward (see S02 plan, "Про project -> projects").
UPDATE "User" SET "projects" = ARRAY["project"] WHERE "project" IS NOT NULL AND "project" <> '';

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "hrmId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "orgUnitTypeId" INTEGER,
    "typeName" TEXT,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "isSinglePerson" BOOLEAN NOT NULL DEFAULT false,
    "parentHrmId" INTEGER,
    "parentId" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "headUserId" TEXT,
    "deputyUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDepartment" (
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDepartment_pkey" PRIMARY KEY ("userId","departmentId")
);

-- CreateTable
CREATE TABLE "HrmSyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "employeesSeen" INTEGER NOT NULL DEFAULT 0,
    "usersCreated" INTEGER NOT NULL DEFAULT 0,
    "usersUpdated" INTEGER NOT NULL DEFAULT 0,
    "usersDismissed" INTEGER NOT NULL DEFAULT 0,
    "usersRestored" INTEGER NOT NULL DEFAULT 0,
    "departmentsUpserted" INTEGER NOT NULL DEFAULT 0,
    "membershipsAdded" INTEGER NOT NULL DEFAULT 0,
    "membershipsRemoved" INTEGER NOT NULL DEFAULT 0,
    "rolesGranted" INTEGER NOT NULL DEFAULT 0,
    "adminsGranted" INTEGER NOT NULL DEFAULT 0,
    "managersResolved" INTEGER NOT NULL DEFAULT 0,
    "failureReason" TEXT,
    "report" JSONB,

    CONSTRAINT "HrmSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrmSyncIssue" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "hrmEmployeeId" INTEGER,
    "email" TEXT,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HrmSyncIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "previousRole" "UserRole" NOT NULL,
    "newRole" "UserRole" NOT NULL,
    "source" TEXT NOT NULL,
    "hrmField" TEXT,
    "runId" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_hrmId_key" ON "Department"("hrmId");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE INDEX "Department_isActive_idx" ON "Department"("isActive");

-- CreateIndex
CREATE INDEX "Department_path_idx" ON "Department"("path");

-- CreateIndex
CREATE INDEX "UserDepartment_departmentId_idx" ON "UserDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "HrmSyncRun_startedAt_idx" ON "HrmSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "HrmSyncRun_status_idx" ON "HrmSyncRun"("status");

-- CreateIndex
CREATE INDEX "HrmSyncIssue_runId_idx" ON "HrmSyncIssue"("runId");

-- CreateIndex
CREATE INDEX "HrmSyncIssue_kind_idx" ON "HrmSyncIssue"("kind");

-- CreateIndex
CREATE INDEX "RoleAuditLog_userId_idx" ON "RoleAuditLog"("userId");

-- CreateIndex
CREATE INDEX "RoleAuditLog_createdAt_idx" ON "RoleAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RoleAuditLog_newRole_idx" ON "RoleAuditLog"("newRole");

-- CreateIndex
CREATE UNIQUE INDEX "User_hrmEmployeeId_key" ON "User"("hrmEmployeeId");

-- CreateIndex
CREATE INDEX "User_hrmEmployeeId_idx" ON "User"("hrmEmployeeId");

-- CreateIndex
CREATE INDEX "User_isArchived_idx" ON "User"("isArchived");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_deputyUserId_fkey" FOREIGN KEY ("deputyUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartment" ADD CONSTRAINT "UserDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HrmSyncIssue" ADD CONSTRAINT "HrmSyncIssue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "HrmSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAuditLog" ADD CONSTRAINT "RoleAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAuditLog" ADD CONSTRAINT "RoleAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
