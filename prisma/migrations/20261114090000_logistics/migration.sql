-- CreateEnum
CREATE TYPE "LogisticsSource" AS ENUM ('WMS', 'TMS_SHIPMENTS', 'TMS_POS');

-- CreateTable
CREATE TABLE "LogisticsImport" (
    "id" TEXT NOT NULL,
    "source" "LogisticsSource" NOT NULL,
    "fileName" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "warnings" JSONB,
    "fetched" BOOLEAN NOT NULL DEFAULT false,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WmsCarton" (
    "id" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "orderNum" TEXT NOT NULL,
    "orderNumber" TEXT,
    "customer" TEXT,
    "trackingNumber" TEXT,
    "secondTrack" TEXT,
    "totLabel" TEXT,
    "product" TEXT,
    "quantity" INTEGER,
    "poNumber" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3) NOT NULL,
    "shipCity" TEXT,
    "shipState" TEXT,
    "shipZip" TEXT,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WmsCarton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsShipment" (
    "id" TEXT NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scac" TEXT,
    "pickupAt" TIMESTAMP(3),
    "pickupLocal" TEXT,
    "deliveryAt" TIMESTAMP(3),
    "deliveryLocal" TEXT,
    "originFacility" TEXT,
    "originCity" TEXT,
    "originState" TEXT,
    "destFacility" TEXT,
    "destCity" TEXT,
    "destState" TEXT,
    "poNumbers" TEXT[],
    "appointment" TEXT,
    "tmsFlags" TEXT[],
    "raw" JSONB NOT NULL,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmsShipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TmsPurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "originFacility" TEXT,
    "originCity" TEXT,
    "originState" TEXT,
    "destFacility" TEXT,
    "destCity" TEXT,
    "destState" TEXT,
    "businessPartner" TEXT,
    "appointment" TEXT,
    "tmsFlags" TEXT[],
    "raw" JSONB NOT NULL,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TmsPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelTracking" (
    "id" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'UPS',
    "status" TEXT,
    "statusCode" TEXT,
    "statusType" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "lastActivity" TEXT,
    "lastLocation" TEXT,
    "activityAt" TIMESTAMP(3),
    "error" TEXT,
    "checkedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcelTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsNote" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT,
    "shipmentNumber" TEXT,
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogisticsNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierLink" (
    "id" TEXT NOT NULL,
    "scac" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT,
    "trackingUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsImport_source_importedAt_idx" ON "LogisticsImport"("source", "importedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WmsCarton_lineKey_key" ON "WmsCarton"("lineKey");

-- CreateIndex
CREATE INDEX "WmsCarton_label_idx" ON "WmsCarton"("label");

-- CreateIndex
CREATE INDEX "WmsCarton_poNumber_idx" ON "WmsCarton"("poNumber");

-- CreateIndex
CREATE INDEX "WmsCarton_trackingNumber_idx" ON "WmsCarton"("trackingNumber");

-- CreateIndex
CREATE INDEX "WmsCarton_secondTrack_idx" ON "WmsCarton"("secondTrack");

-- CreateIndex
CREATE UNIQUE INDEX "TmsShipment_shipmentNumber_key" ON "TmsShipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "TmsShipment_scac_idx" ON "TmsShipment"("scac");

-- CreateIndex
CREATE UNIQUE INDEX "TmsPurchaseOrder_poNumber_key" ON "TmsPurchaseOrder"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ParcelTracking_trackingNumber_key" ON "ParcelTracking"("trackingNumber");

-- CreateIndex
CREATE INDEX "LogisticsNote_poNumber_idx" ON "LogisticsNote"("poNumber");

-- CreateIndex
CREATE INDEX "LogisticsNote_shipmentNumber_idx" ON "LogisticsNote"("shipmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierLink_scac_key" ON "CarrierLink"("scac");

-- AddForeignKey
ALTER TABLE "LogisticsImport" ADD CONSTRAINT "LogisticsImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogisticsNote" ADD CONSTRAINT "LogisticsNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Carriers whose tracking pages are known; admins add the rest (and refine links) under Logistics › Carriers
INSERT INTO "CarrierLink" ("id", "scac", "name", "mode", "trackingUrl", "createdAt", "updatedAt") VALUES
  ('carrier_abfs', 'ABFS', 'ABF Freight', 'LTL', 'https://arcb.com/tools/tracking.html', now(), now()),
  ('carrier_exla', 'EXLA', 'Estes Express Lines', 'LTL', 'https://www.estes-express.com/myestes/shipment-tracking/', now(), now()),
  ('carrier_ctii', 'CTII', 'Central Transport', 'LTL', 'https://www.centraltransport.com/tracking', now(), now()),
  ('carrier_odfl', 'ODFL', 'Old Dominion Freight Line', 'LTL', 'https://www.odfl.com/us/en/tools/trace-track-ltl-freight.html', now(), now()),
  ('carrier_saia', 'SAIA', 'Saia', 'LTL', 'https://www.saia.com/track', now(), now()),
  ('carrier_rlca', 'RLCA', 'R+L Carriers', 'LTL', 'https://www.rlcarriers.com/freight/shipping/shipment-tracing', now(), now()),
  ('carrier_xpol', 'XPOL', 'XPO', 'LTL', 'https://www.xpo.com/track/', now(), now()),
  ('carrier_fxfe', 'FXFE', 'FedEx Freight', 'LTL', 'https://www.fedex.com/fedextrack/?trknbr={pro}', now(), now()),
  ('carrier_upgf', 'UPGF', 'TForce Freight', 'LTL', 'https://www.tforcefreight.com/ltl/apps/Tracking', now(), now()),
  ('carrier_aact', 'AACT', 'AAA Cooper Transportation', 'LTL', 'https://www.aaacooper.com/tracking', now(), now()),
  ('carrier_sefl', 'SEFL', 'Southeastern Freight Lines', 'LTL', 'https://www.sefl.com/Tracing/index.jsp', now(), now()),
  ('carrier_knig', 'KNIG', 'Knight Transportation', 'TL', NULL, now(), now()),
  ('carrier_upsn', 'UPSN', 'UPS', 'Parcel', 'https://www.ups.com/track?tracknum={pro}', now(), now())
ON CONFLICT ("scac") DO NOTHING;
