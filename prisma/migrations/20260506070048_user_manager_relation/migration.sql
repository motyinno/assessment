ALTER TABLE "User" ADD COLUMN "managerId" TEXT;

UPDATE "User" u
SET    "managerId" = m.id
FROM   "User" m
WHERE  u.manager IS NOT NULL
  AND  LOWER(TRIM(u.manager)) = LOWER(TRIM(m.name));

ALTER TABLE "User"
  ADD CONSTRAINT "User_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_managerId_idx" ON "User"("managerId");

ALTER TABLE "User" DROP COLUMN "manager";
