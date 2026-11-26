-- Admin › Teams: the teams responsible become a table admins edit, instead of a fixed list.
-- Reviews and issues keep their values, which become the teams' keys.
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Team_key_key" ON "Team"("key");
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

INSERT INTO "Team" ("id", "key", "name", "active", "sortOrder", "updatedAt") VALUES
  ('team_warehouse_site_0', 'WAREHOUSE_SITE_0', 'Warehouse (Site 0)', true, 10, now()),
  ('team_warehouse_site_3', 'WAREHOUSE_SITE_3', 'Warehouse (Site 3)', true, 20, now()),
  ('team_warehouse', 'WAREHOUSE', 'Warehouse (site not set)', false, 30, now()),
  ('team_customer_service', 'CUSTOMER_SERVICE', 'Customer Service', true, 40, now()),
  ('team_cs_warehouse', 'CS_WAREHOUSE', 'CS / Warehouse', true, 50, now()),
  ('team_edi', 'EDI', 'EDI', true, 60, now()),
  ('team_ecomm', 'ECOMM', 'Ecomm', true, 70, now()),
  ('team_carrier', 'CARRIER', 'Carrier', true, 80, now()),
  ('team_thd', 'THD', 'THD', true, 90, now()),
  ('team_other', 'OTHER', 'Other', true, 100, now());

ALTER TABLE "LineReview" ALTER COLUMN "teamInfluence" TYPE TEXT USING "teamInfluence"::text;
ALTER TABLE "Issue" ALTER COLUMN "team" TYPE TEXT USING "team"::text;
DROP TYPE "TeamInfluence";

ALTER TABLE "LineReview" ADD CONSTRAINT "LineReview_teamInfluence_fkey" FOREIGN KEY ("teamInfluence") REFERENCES "Team"("key") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_team_fkey" FOREIGN KEY ("team") REFERENCES "Team"("key") ON DELETE SET NULL ON UPDATE CASCADE;
