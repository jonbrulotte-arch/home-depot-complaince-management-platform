-- Packing Slip Generator: warehouse ship-from names and addresses, the destination address book, and the permission

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "address" TEXT,
ADD COLUMN     "shipFromName" TEXT;

-- CreateTable
CREATE TABLE "DestinationAddress" (
    "id" TEXT NOT NULL,
    "facility" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "DestinationAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DestinationAddress_facility_key" ON "DestinationAddress"("facility");


-- The two warehouses' ship-from names and addresses (editable under Admin › Settings › Warehouses)
UPDATE "Warehouse" SET "shipFromName" = 'JS PRODUCTS - 875062OH001', "address" = E'6380 Adelaide Court\nGroveport, OH 43125'
WHERE "prefix" = '3-' AND "address" IS NULL;
UPDATE "Warehouse" SET "shipFromName" = 'JS PRODUCTS - 875062NV002', "address" = E'6445 Montessouri Street\nLas Vegas, NV 89113'
WHERE "prefix" = '0-' AND "address" IS NULL;

-- Analysts generate packing slips (Admin always has every permission)
UPDATE "Role" SET "permissions" = "permissions" || ARRAY['packingslips.use'], "updatedAt" = now()
WHERE "name" = 'Analyst' AND NOT ('packingslips.use' = ANY ("permissions"));
