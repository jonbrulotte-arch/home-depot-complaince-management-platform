-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('PREPARING', 'READY', 'SUBMITTED', 'APPROVED', 'PARTIAL', 'DENIED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DisputeEventType" AS ENUM ('CREATED', 'NOTE', 'STATUS', 'ATTACHMENT', 'SPM_UPDATE');

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'PREPARING',
    "reasonCodeId" TEXT,
    "amountDisputed" DECIMAL(12,2) NOT NULL,
    "amountRecovered" DECIMAL(12,2),
    "dueDate" TIMESTAMP(3),
    "checklist" JSONB NOT NULL,
    "supplierComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "spmReference" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionCode" TEXT,
    "decisionNotes" TEXT,
    "spmDecisionSeen" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeEvent" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "type" "DisputeEventType" NOT NULL,
    "body" TEXT,
    "fromStatus" "DisputeStatus",
    "toStatus" "DisputeStatus",
    "userId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeAttachment" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_lineId_key" ON "Dispute"("lineId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "DisputeEvent_disputeId_at_idx" ON "DisputeEvent"("disputeId", "at");

-- CreateIndex
CREATE INDEX "DisputeAttachment_disputeId_idx" ON "DisputeAttachment"("disputeId");

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "ComplianceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_reasonCodeId_fkey" FOREIGN KEY ("reasonCodeId") REFERENCES "DisputeReasonCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvent" ADD CONSTRAINT "DisputeEvent_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEvent" ADD CONSTRAINT "DisputeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeAttachment" ADD CONSTRAINT "DisputeAttachment_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeAttachment" ADD CONSTRAINT "DisputeAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
