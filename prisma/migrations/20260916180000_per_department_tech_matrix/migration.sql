-- Per-department (Division) tech matrix + session templates. Nullable FKs:
-- existing rows keep departmentId = NULL (legacy, never surfaced by the
-- department-scoped app code going forward, but not deleted so historical
-- RoadmapProgress/SelfAssessment/AssessmentSession references stay valid).

ALTER TABLE "MatrixSection" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "MatrixSection_departmentId_idx" ON "MatrixSection"("departmentId");
ALTER TABLE "MatrixSection" ADD CONSTRAINT "MatrixSection_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionTemplate" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "SessionTemplate_assessmentType_gradeBand_key_key";
CREATE UNIQUE INDEX "SessionTemplate_departmentId_assessmentType_gradeBand_key_key"
  ON "SessionTemplate"("departmentId", "assessmentType", "gradeBand", "key");
