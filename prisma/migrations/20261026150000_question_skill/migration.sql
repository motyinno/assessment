-- Interview questions: which matrix skill a question tests, or which one it proposes.

ALTER TABLE "InterviewQuestion" ADD COLUMN "skill" TEXT,
ADD COLUMN "proposedSkill" TEXT;

CREATE INDEX "InterviewQuestion_topicId_skill_idx" ON "InterviewQuestion"("topicId", "skill");
