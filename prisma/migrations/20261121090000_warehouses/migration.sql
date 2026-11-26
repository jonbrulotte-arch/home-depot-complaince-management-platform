-- Warehouses (Admin › Settings): the WMS OrderNumber prefix tells which warehouse shipped

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_prefix_key" ON "Warehouse"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");


-- The two warehouses JS Products ships from
INSERT INTO "Warehouse" ("id", "prefix", "name", "sortOrder", "updatedAt") VALUES
  ('wh_site_3', '3-', 'Ohio Warehouse (Site 3)', 10, CURRENT_TIMESTAMP),
  ('wh_site_0', '0-', 'LV Warehouse (Site 0)', 20, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
