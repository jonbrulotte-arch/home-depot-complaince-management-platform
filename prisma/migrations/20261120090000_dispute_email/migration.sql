-- Disputes › Send Email log: every email sent (or failed) about a report's disputes, with its PDF

-- CreateTable
CREATE TABLE "DisputeEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportId" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "disputeIds" TEXT[],
    "poNumbers" TEXT[],
    "teamKey" TEXT,
    "teamName" TEXT,
    "to" TEXT[],
    "cc" TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requests" TEXT[],
    "fileName" TEXT NOT NULL,
    "attachment" BYTEA NOT NULL,
    "sent" BOOLEAN NOT NULL,
    "error" TEXT,

    CONSTRAINT "DisputeEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisputeEmail_reportId_createdAt_idx" ON "DisputeEmail"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "DisputeEmail_disputeIds_idx" ON "DisputeEmail" USING GIN ("disputeIds");

-- AddForeignKey
ALTER TABLE "DisputeEmail" ADD CONSTRAINT "DisputeEmail_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ComplianceReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeEmail" ADD CONSTRAINT "DisputeEmail_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

