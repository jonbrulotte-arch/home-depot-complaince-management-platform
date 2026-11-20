-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'site',
    "brandingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "siteName" TEXT,
    "logo" BYTEA,
    "logoContentType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);
