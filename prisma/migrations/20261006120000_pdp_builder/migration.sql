-- CreateEnum
CREATE TYPE "PdpItemType" AS ENUM ('THEORY', 'PRACTICE');

-- AlterTable
ALTER TABLE "Pdp" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "docSyncedAt" TIMESTAMP(3),
ADD COLUMN     "planUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PdpGoal" (
    "id" TEXT NOT NULL,
    "pdpId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "matrixTopicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdpGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdpItem" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "PdpItemType" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdpItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdpGoal_pdpId_idx" ON "PdpGoal"("pdpId");

-- CreateIndex
CREATE INDEX "PdpItem_goalId_idx" ON "PdpItem"("goalId");

-- AddForeignKey
ALTER TABLE "Pdp" ADD CONSTRAINT "Pdp_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpGoal" ADD CONSTRAINT "PdpGoal_pdpId_fkey" FOREIGN KEY ("pdpId") REFERENCES "Pdp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpItem" ADD CONSTRAINT "PdpItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PdpGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: the admin review step is gone — the employee's manager now approves in
-- the builder. Plans waiting in review become drafts. AI-generated ones carry
-- their topics in "topicsJson" ({ category, questions[], practicalTask }), so
-- they get goals/items and open in the builder; others stay doc-only drafts.
INSERT INTO "PdpGoal" ("id", "pdpId", "order", "title", "createdAt", "updatedAt")
SELECT 'mig_' || p."id" || '_' || (t.ord - 1), p."id", (t.ord - 1)::int, t.elem->>'category', NOW(), NOW()
FROM "Pdp" p
CROSS JOIN LATERAL jsonb_array_elements(p."topicsJson") WITH ORDINALITY AS t(elem, ord)
WHERE p."status" = 'ON_REVIEW'
  AND jsonb_typeof(p."topicsJson") = 'array'
  AND jsonb_typeof(t.elem) = 'object'
  AND coalesce(t.elem->>'category', '') <> '';

INSERT INTO "PdpItem" ("id", "goalId", "order", "type", "text", "createdAt", "updatedAt")
SELECT g."id" || '_q' || (q.ord - 1), g."id", (q.ord - 1)::int, 'THEORY', q.txt, NOW(), NOW()
FROM "PdpGoal" g
JOIN "Pdp" p ON p."id" = g."pdpId"
CROSS JOIN LATERAL jsonb_array_elements_text(p."topicsJson"->g."order"->'questions') WITH ORDINALITY AS q(txt, ord)
WHERE g."id" LIKE 'mig\_%'
  AND jsonb_typeof(p."topicsJson"->g."order"->'questions') = 'array'
  AND q.txt <> '';

INSERT INTO "PdpItem" ("id", "goalId", "order", "type", "text", "createdAt", "updatedAt")
SELECT g."id" || '_t', g."id", 1000, 'PRACTICE', p."topicsJson"->g."order"->>'practicalTask', NOW(), NOW()
FROM "PdpGoal" g
JOIN "Pdp" p ON p."id" = g."pdpId"
WHERE g."id" LIKE 'mig\_%'
  AND coalesce(p."topicsJson"->g."order"->>'practicalTask', '') <> '';

UPDATE "Pdp" SET "status" = 'DRAFT', "planUpdatedAt" = NOW() WHERE "status" = 'ON_REVIEW';
