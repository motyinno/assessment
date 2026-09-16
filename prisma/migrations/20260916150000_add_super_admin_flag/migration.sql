-- Adds a standalone super-admin flag, separate from the `role` enum, so it
-- can't interact with HRM sync's role-rank/downgrade logic and doesn't
-- require touching every `role === "ADMIN"` check across the app.
ALTER TABLE "User" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
