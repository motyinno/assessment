-- AlterTable
ALTER TABLE "Pdp" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "completionNote" TEXT;

-- AlterTable
ALTER TABLE "PdpItem" ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "link" TEXT;

-- AddForeignKey
ALTER TABLE "Pdp" ADD CONSTRAINT "Pdp_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
