-- Store the original generation inputs so a FAILED pdp can be retried in place.
ALTER TABLE "Pdp" ADD COLUMN "generationInputs" JSONB;
