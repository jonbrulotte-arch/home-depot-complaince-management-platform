
-- CreateTable
CREATE TABLE "LineCount" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "period" "DataPeriod" NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LineCount_reportId_programId_period_key" ON "LineCount"("reportId", "programId", "period");

-- AddForeignKey
ALTER TABLE "LineCount" ADD CONSTRAINT "LineCount_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineCount" ADD CONSTRAINT "LineCount_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineCount" ADD CONSTRAINT "LineCount_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

