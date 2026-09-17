-- "Position in the company" fields, mirrored from HRM on every sync.
ALTER TABLE "User" ADD COLUMN "managerialLevel" TEXT;
ALTER TABLE "User" ADD COLUMN "professionalLevel" TEXT;
ALTER TABLE "User" ADD COLUMN "isMentor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "isDeliveryCoordinator" BOOLEAN NOT NULL DEFAULT false;

-- Denormalized Division membership: the one org level the product splits by.
ALTER TABLE "User" ADD COLUMN "divisionId" TEXT;
CREATE INDEX "User_divisionId_idx" ON "User"("divisionId");
ALTER TABLE "User" ADD CONSTRAINT "User_divisionId_fkey"
  FOREIGN KEY ("divisionId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- M1..M5 managerial chain.
CREATE TABLE "UserManagerLink" (
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "hrmManagerId" INTEGER NOT NULL,
    "managerId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserManagerLink_pkey" PRIMARY KEY ("userId","level")
);

CREATE INDEX "UserManagerLink_managerId_idx" ON "UserManagerLink"("managerId");
CREATE INDEX "UserManagerLink_hrmManagerId_idx" ON "UserManagerLink"("hrmManagerId");

ALTER TABLE "UserManagerLink" ADD CONSTRAINT "UserManagerLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserManagerLink" ADD CONSTRAINT "UserManagerLink_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
