-- THD's POM (Purchase Order Management) PO search export: POs and their SKU lines

-- AlterEnum
ALTER TYPE "LogisticsSource" ADD VALUE 'POM';

-- CreateTable
CREATE TABLE "PomPurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "dept" TEXT,
    "poCreateDate" DATE,
    "poType" TEXT,
    "status" TEXT NOT NULL,
    "buyer" TEXT,
    "reasonCode" TEXT,
    "soq" TEXT,
    "vendorNumber" TEXT,
    "totalQty" INTEGER,
    "totalCost" DECIMAL(14,2),
    "esd" DATE,
    "dcDueDate" DATE,
    "factory" TEXT,
    "containerType" TEXT,
    "portOfLading" TEXT,
    "destinationDc" TEXT,
    "crossDock" TEXT,
    "finalRecvLocation" TEXT,
    "transferPo" TEXT,
    "mode" TEXT,
    "lingerDate" DATE,
    "raw" JSONB NOT NULL,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PomPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PomPoLine" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "thdSku" TEXT,
    "description" TEXT,
    "partNumber" TEXT,
    "status" TEXT,
    "orderQty" INTEGER,
    "adjOrderQty" INTEGER,
    "shippedQty" INTEGER,
    "receivedQty" INTEGER,
    "unitCost" DECIMAL(14,4),
    "raw" JSONB NOT NULL,

    CONSTRAINT "PomPoLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PomPurchaseOrder_poNumber_key" ON "PomPurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PomPoLine_poNumber_idx" ON "PomPoLine"("poNumber");

-- CreateIndex
CREATE INDEX "PomPoLine_partNumber_idx" ON "PomPoLine"("partNumber");

-- AddForeignKey
ALTER TABLE "PomPoLine" ADD CONSTRAINT "PomPoLine_poNumber_fkey" FOREIGN KEY ("poNumber") REFERENCES "PomPurchaseOrder"("poNumber") ON DELETE CASCADE ON UPDATE CASCADE;
