-- The period enum now covers imports as well as shipment counts
ALTER TYPE "ShipmentPeriod" RENAME TO "DataPeriod";

-- Imports made before periods existed count as "All other data"
ALTER TABLE "ImportBatch" ADD COLUMN "period" "DataPeriod" NOT NULL DEFAULT 'OTHER';
