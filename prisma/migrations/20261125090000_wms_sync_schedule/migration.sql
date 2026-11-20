-- Scheduled WMS sync (Admin › Settings › WMS report link)
ALTER TABLE "SiteSettings" ADD COLUMN "wmsSyncMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "wmsSyncNextAt" TIMESTAMP(3),
ADD COLUMN "wmsSyncLastAt" TIMESTAMP(3),
ADD COLUMN "wmsSyncLastOk" BOOLEAN,
ADD COLUMN "wmsSyncLastMessage" TEXT;
