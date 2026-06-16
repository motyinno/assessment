-- CreateEnum
CREATE TYPE "PdpItemType" AS ENUM ('THEORY', 'PRACTICE');

-- CreateEnum
CREATE TYPE "PdpItemStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REWORK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PDP_ITEM_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'PDP_ITEM_REVIEWED';
ALTER TYPE "NotificationType" ADD VALUE 'PDP_COMPLETED';

-- CreateTable
CREATE TABLE "PdpItem" (
    "id" TEXT NOT NULL,
    "pdpId" TEXT NOT NULL,
    "type" "PdpItemType" NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "PdpItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "evidenceLink" TEXT,
    "evidenceNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdpItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdpItem_pdpId_idx" ON "PdpItem"("pdpId");

-- CreateIndex
CREATE INDEX "PdpItem_reviewerId_status_idx" ON "PdpItem"("reviewerId", "status");

-- AddForeignKey
ALTER TABLE "PdpItem" ADD CONSTRAINT "PdpItem_pdpId_fkey" FOREIGN KEY ("pdpId") REFERENCES "Pdp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpItem" ADD CONSTRAINT "PdpItem_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
