-- Channels (Admin › Settings): the WMS CUST_NUM tells which channel a PO belongs to

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_code_key" ON "Channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");


-- The two channels in the WMS data
INSERT INTO "Channel" ("id", "code", "name", "sortOrder", "updatedAt") VALUES
  ('ch_rdc', 'THD', 'Rapid Distribution Center (RDC)', 10, CURRENT_TIMESTAMP),
  ('ch_dfc', 'THD.COM-DFDC', 'Direct Fulfillment Center (DFC)', 20, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
