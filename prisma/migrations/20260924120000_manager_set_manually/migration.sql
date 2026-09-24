-- A human-picked manager must survive the next HRM sync (see sync.ts resolveManagers).
ALTER TABLE "User" ADD COLUMN "managerSetManually" BOOLEAN NOT NULL DEFAULT false;
