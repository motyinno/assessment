-- Toggle to enable/disable a session template without deleting it.
ALTER TABLE "SessionTemplate" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
