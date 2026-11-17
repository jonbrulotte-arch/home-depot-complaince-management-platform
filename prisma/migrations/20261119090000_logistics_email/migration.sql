-- Logistics › Send Email log: every email sent (or failed), with its PDF

-- CreateTable
CREATE TABLE "LogisticsEmail" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "selected" TEXT[],
    "poNumbers" TEXT[],
    "shipmentNumbers" TEXT[],
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

    CONSTRAINT "LogisticsEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogisticsEmail_createdAt_idx" ON "LogisticsEmail"("createdAt");

-- CreateIndex
CREATE INDEX "LogisticsEmail_poNumbers_idx" ON "LogisticsEmail" USING GIN ("poNumbers");

-- CreateIndex
CREATE INDEX "LogisticsEmail_shipmentNumbers_idx" ON "LogisticsEmail" USING GIN ("shipmentNumbers");

-- AddForeignKey
ALTER TABLE "LogisticsEmail" ADD CONSTRAINT "LogisticsEmail_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

