-- CreateEnum
CREATE TYPE "PeriodBasis" AS ENUM ('RECEIVED_MONTH', 'FISCAL_MONTH');

-- AlterTable
-- Existing lines start with their fiscal month; re-running the backfill on the archive sets
-- the month each was actually received (its folder).
ALTER TABLE "ComplianceLine" ADD COLUMN     "receivedMonth" INTEGER;
UPDATE "ComplianceLine" SET "receivedMonth" = "fiscalMonth";
ALTER TABLE "ComplianceLine" ALTER COLUMN "receivedMonth" SET NOT NULL;

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN     "receivedMonth" INTEGER;

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "reportPeriodBasis" "PeriodBasis" NOT NULL DEFAULT 'RECEIVED_MONTH';

-- CreateIndex
CREATE INDEX "ComplianceLine_receivedMonth_metricId_idx" ON "ComplianceLine"("receivedMonth", "metricId");
