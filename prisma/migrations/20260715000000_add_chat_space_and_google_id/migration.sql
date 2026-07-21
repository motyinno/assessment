-- Google account id (OAuth `sub`) so we can @mention / add the user in Google Chat.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- Google Chat space resource name ("spaces/AAAA…") backing this assessment's
-- notification thread. Created at request time, reused across the lifecycle.
ALTER TABLE "AssessmentRequest" ADD COLUMN "chatSpaceName" TEXT;
