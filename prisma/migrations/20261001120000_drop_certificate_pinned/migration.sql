-- Certificates are visible on the profile as soon as they are added; the
-- per-certificate "pin" toggle is gone.
ALTER TABLE "Certificate" DROP COLUMN "pinned";
