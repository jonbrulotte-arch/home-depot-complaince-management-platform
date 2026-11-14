-- CreateEnum
CREATE TYPE "OffsetType" AS ENUM ('NONE', 'FLAT', 'PCT_VALUE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'DISPUTES', 'SCORECARD', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ReportProgramStatus" AS ENUM ('NOT_STARTED', 'IMPORTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "ExportKind" AS ENUM ('ALL_RESULTS', 'NON_COMPLIANT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Disposition" AS ENUM ('PENDING', 'ACCEPTED', 'DISPUTABLE', 'NOT_DISPUTABLE', 'NEEDS_RESEARCH');

-- CreateEnum
CREATE TYPE "TeamInfluence" AS ENUM ('WAREHOUSE', 'CUSTOMER_SERVICE', 'CS_WAREHOUSE', 'EDI', 'ECOMM', 'CARRIER', 'THD', 'OTHER');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filePrefix" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetNames" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricRule" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "effectiveFrom" INTEGER NOT NULL,
    "thresholdPct" DECIMAL(6,3) NOT NULL,
    "offsetType" "OffsetType" NOT NULL,
    "offsetAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "MetricRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnAlias" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "metricId" TEXT,
    "sourceHeader" TEXT NOT NULL,
    "canonicalField" TEXT NOT NULL,

    CONSTRAINT "ColumnAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeReasonCode" (
    "id" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "whenToUse" TEXT,
    "requiredDocs" TEXT,
    "docDetails" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DisputeReasonCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompliancePeriod" (
    "id" TEXT NOT NULL,
    "fiscalMonth" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "disputeOpen" TIMESTAMP(3),
    "disputeClose" TIMESTAMP(3),

    CONSTRAINT "CompliancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceReport" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportProgram" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "status" "ReportProgramStatus" NOT NULL DEFAULT 'NOT_STARTED',

    CONSTRAINT "ReportProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "reportProgramId" TEXT,
    "programId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "exportKind" "ExportKind" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "rowCount" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "importedById" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpmSummaryRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "metricId" TEXT,
    "metricLabel" TEXT NOT NULL,
    "mVendor" TEXT,
    "programStatus" TEXT,
    "totalLines" INTEGER,
    "compliantLines" INTEGER,
    "nonCompliantLines" INTEGER,
    "offsetsPreDispute" DECIMAL(12,2),
    "offsetsPostDispute" DECIMAL(12,2),
    "disputedLines" INTEGER,
    "approvedLines" INTEGER,
    "deniedLines" INTEGER,
    "thresholdPct" DECIMAL(6,3),
    "preDisputePerfPct" DECIMAL(6,3),
    "postDisputePerfPct" DECIMAL(6,3),

    CONSTRAINT "SpmSummaryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoRecord" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "pVendor" TEXT,
    "mVendor" TEXT,
    "mVendorName" TEXT,
    "dept" TEXT,
    "dcNumber" TEXT,
    "poCreateDate" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceLine" (
    "id" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "poRecordId" TEXT,
    "fiscalMonth" INTEGER NOT NULL,
    "isCompliant" BOOLEAN NOT NULL,
    "offsetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "poNumber" TEXT,
    "dcNumber" TEXT,
    "sku" TEXT,
    "vendorSku" TEXT,
    "skuDescription" TEXT,
    "customerOrder" TEXT,
    "omsId" TEXT,
    "trackingNumber" TEXT,
    "orderedQty" DECIMAL(12,2),
    "receivedQty" DECIMAL(12,2),
    "fillRatePct" DECIMAL(7,3),
    "poCreateDate" TIMESTAMP(3),
    "expectedArrivalDate" TIMESTAMP(3),
    "estShipDate" TIMESTAMP(3),
    "estDeliveryDate" TIMESTAMP(3),
    "actualShipDate" TIMESTAMP(3),
    "rtsSent" TIMESTAMP(3),
    "pickupRequestDate" TIMESTAMP(3),
    "trailerCheckIn" TIMESTAMP(3),
    "asnTimestamp" TIMESTAMP(3),
    "asnReceivedAt" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "cancelDate" TIMESTAMP(3),
    "bolNumber" TEXT,
    "tmsId" TEXT,
    "shipmentNumber" TEXT,
    "docTraceId" TEXT,
    "carrierUsed" TEXT,
    "carrierPro" TEXT,
    "rgCarriers" TEXT,
    "originState" TEXT,
    "destinationState" TEXT,
    "freightTerms" TEXT,
    "invoiceNumber" TEXT,
    "offsetType" TEXT,
    "reason" TEXT,
    "lateReason" TEXT,
    "businessDaysLate" DECIMAL(8,2),
    "rescheduled" BOOLEAN,
    "spmStatus" TEXT,
    "spmDisputeReason" TEXT,
    "spmSupplierComment" TEXT,
    "spmDecision" TEXT,
    "spmDecisionDetail" TEXT,
    "spmCoordinatorComment" TEXT,
    "raw" JSONB NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineReview" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "disposition" "Disposition" NOT NULL DEFAULT 'PENDING',
    "teamInfluence" "TeamInfluence",
    "reasonCodeId" TEXT,
    "rootCause" TEXT,
    "notes" TEXT,
    "extraFields" JSONB,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Metric_programId_code_key" ON "Metric"("programId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "MetricRule_metricId_effectiveFrom_key" ON "MetricRule"("metricId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ColumnAlias_programId_metricId_sourceHeader_key" ON "ColumnAlias"("programId", "metricId", "sourceHeader");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeReasonCode_metricId_code_key" ON "DisputeReasonCode"("metricId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CompliancePeriod_fiscalMonth_key" ON "CompliancePeriod"("fiscalMonth");

-- CreateIndex
CREATE INDEX "ComplianceReport_periodId_idx" ON "ComplianceReport"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportProgram_reportId_programId_key" ON "ReportProgram"("reportId", "programId");

-- CreateIndex
CREATE INDEX "ImportBatch_sha256_idx" ON "ImportBatch"("sha256");

-- CreateIndex
CREATE INDEX "ImportBatch_reportProgramId_idx" ON "ImportBatch"("reportProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "PoRecord_poNumber_key" ON "PoRecord"("poNumber");

-- CreateIndex
CREATE INDEX "ComplianceLine_poNumber_idx" ON "ComplianceLine"("poNumber");

-- CreateIndex
CREATE INDEX "ComplianceLine_fiscalMonth_metricId_idx" ON "ComplianceLine"("fiscalMonth", "metricId");

-- CreateIndex
CREATE INDEX "ComplianceLine_docTraceId_idx" ON "ComplianceLine"("docTraceId");

-- CreateIndex
CREATE INDEX "ComplianceLine_tmsId_idx" ON "ComplianceLine"("tmsId");

-- CreateIndex
CREATE INDEX "ComplianceLine_carrierPro_idx" ON "ComplianceLine"("carrierPro");

-- CreateIndex
CREATE INDEX "ComplianceLine_sku_idx" ON "ComplianceLine"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceLine_metricId_lineKey_key" ON "ComplianceLine"("metricId", "lineKey");

-- CreateIndex
CREATE UNIQUE INDEX "LineReview_lineId_key" ON "LineReview"("lineId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricRule" ADD CONSTRAINT "MetricRule_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnAlias" ADD CONSTRAINT "ColumnAlias_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnAlias" ADD CONSTRAINT "ColumnAlias_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeReasonCode" ADD CONSTRAINT "DisputeReasonCode_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReport" ADD CONSTRAINT "ComplianceReport_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CompliancePeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceReport" ADD CONSTRAINT "ComplianceReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportProgram" ADD CONSTRAINT "ReportProgram_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportProgram" ADD CONSTRAINT "ReportProgram_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_reportProgramId_fkey" FOREIGN KEY ("reportProgramId") REFERENCES "ReportProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpmSummaryRow" ADD CONSTRAINT "SpmSummaryRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpmSummaryRow" ADD CONSTRAINT "SpmSummaryRow_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLine" ADD CONSTRAINT "ComplianceLine_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLine" ADD CONSTRAINT "ComplianceLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceLine" ADD CONSTRAINT "ComplianceLine_poRecordId_fkey" FOREIGN KEY ("poRecordId") REFERENCES "PoRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReview" ADD CONSTRAINT "LineReview_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "ComplianceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineReview" ADD CONSTRAINT "LineReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
