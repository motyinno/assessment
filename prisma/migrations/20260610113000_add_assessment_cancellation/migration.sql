-- Admin-only assessment cancellation with a mandatory reason.
ALTER TABLE "Assessment" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Assessment" ADD COLUMN "cancelledById" TEXT;
