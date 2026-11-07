-- Counts entered before this migration were totals for the report; they become the "All other data"
-- period (OTHER) and the On-Time & Fill Rate period starts empty.

-- CreateEnum
CREATE TYPE "ShipmentPeriod" AS ENUM ('FILL_ON_TIME', 'OTHER');

-- DropIndex
DROP INDEX "ShipmentCount_reportId_programId_mode_key";

-- AlterTable
ALTER TABLE "ShipmentCount" ADD COLUMN     "period" "ShipmentPeriod" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentCount_reportId_programId_period_mode_key" ON "ShipmentCount"("reportId", "programId", "period", "mode");

