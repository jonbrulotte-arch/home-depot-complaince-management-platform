-- AlterTable
ALTER TABLE "Scorecard" ADD COLUMN     "shareToken" TEXT;

-- CreateTable
CREATE TABLE "ScorecardFeedback" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScorecardFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScorecardFeedback_reportId_lineId_idx" ON "ScorecardFeedback"("reportId", "lineId");

-- CreateIndex
CREATE UNIQUE INDEX "Scorecard_shareToken_key" ON "Scorecard"("shareToken");

-- AddForeignKey
ALTER TABLE "ScorecardFeedback" ADD CONSTRAINT "ScorecardFeedback_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardFeedback" ADD CONSTRAINT "ScorecardFeedback_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "ComplianceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScorecardFeedback" ADD CONSTRAINT "ScorecardFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Scorecard Feedback: a Warehouse role that sees published scorecards and comments on violations.
-- Analysts can read and answer the feedback. (Admin always has every permission.)
INSERT INTO "Role" ("id", "name", "description", "permissions", "system", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Warehouse', 'Warehouse team: reviews published scorecards and gives feedback on violations',
        ARRAY['feedback.view', 'feedback.submit'], true, now(), now())
ON CONFLICT ("name") DO NOTHING;

UPDATE "Role" SET "permissions" = "permissions" || ARRAY['feedback.view', 'feedback.submit'], "updatedAt" = now()
WHERE "name" = 'Analyst' AND NOT ('feedback.view' = ANY ("permissions"));
