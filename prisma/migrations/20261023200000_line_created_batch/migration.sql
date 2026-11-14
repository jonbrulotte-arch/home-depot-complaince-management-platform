-- AlterTable
ALTER TABLE "ComplianceLine" ADD COLUMN     "createdBatchId" TEXT;

-- CreateIndex
CREATE INDEX "ComplianceLine_createdBatchId_idx" ON "ComplianceLine"("createdBatchId");


-- Existing lines: an import that created lines and updated none created every line it still
-- holds. For imports that also updated lines the creator is unknown, so it stays null and a
-- purge keeps those lines.
UPDATE "ComplianceLine" l
SET "createdBatchId" = l."batchId"
FROM "ImportBatch" b
WHERE b.id = l."batchId" AND b."updatedCount" = 0 AND b."createdCount" > 0;
