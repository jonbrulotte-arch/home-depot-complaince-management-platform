-- The WMS report link and UPS Tracking API credentials (Admin › Settings); the WMS link is set to
-- JS Products' "shipped last 60 days" report
ALTER TABLE "SiteSettings" ADD COLUMN "wmsReportUrl" TEXT,
ADD COLUMN "upsClientId" TEXT,
ADD COLUMN "upsClientSecret" TEXT,
ADD COLUMN "upsTestMode" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "SiteSettings" ("id", "wmsReportUrl", "updatedAt")
VALUES ('site', 'http://mango.jsproducts.com/qc-dims/public/excel/Reader/php/ShippedLast60.php', now())
ON CONFLICT ("id") DO UPDATE SET "wmsReportUrl" = EXCLUDED."wmsReportUrl" WHERE "SiteSettings"."wmsReportUrl" IS NULL;
