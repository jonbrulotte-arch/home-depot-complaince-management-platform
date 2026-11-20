-- CreateEnum
CREATE TYPE "ShipmentMode" AS ENUM ('SMALL_PARCEL', 'LTL_TL');

-- CreateTable
CREATE TABLE "ShipmentCount" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "mode" "ShipmentMode" NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentCount_reportId_programId_mode_key" ON "ShipmentCount"("reportId", "programId", "mode");

-- AddForeignKey
ALTER TABLE "ShipmentCount" ADD CONSTRAINT "ShipmentCount_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentCount" ADD CONSTRAINT "ShipmentCount_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentCount" ADD CONSTRAINT "ShipmentCount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
