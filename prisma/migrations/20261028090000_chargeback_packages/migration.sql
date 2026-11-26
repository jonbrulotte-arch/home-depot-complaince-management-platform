-- CreateTable
CREATE TABLE "ChargebackPackage" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "period" "DataPeriod" NOT NULL,
    "packageId" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChargebackPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChargebackPackage_packageId_idx" ON "ChargebackPackage"("packageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargebackPackage_reportId_programId_period_key" ON "ChargebackPackage"("reportId", "programId", "period");

-- AddForeignKey
ALTER TABLE "ChargebackPackage" ADD CONSTRAINT "ChargebackPackage_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargebackPackage" ADD CONSTRAINT "ChargebackPackage_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargebackPackage" ADD CONSTRAINT "ChargebackPackage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

