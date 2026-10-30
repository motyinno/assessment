-- Interview question import: AI maps questions without a topic onto the matrix in the background.

ALTER TABLE "InterviewQuestion" ADD COLUMN "pendingTopic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pendingKind" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "InterviewQuestionImport" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DONE',
ADD COLUMN "mapTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mapDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "error" TEXT;
