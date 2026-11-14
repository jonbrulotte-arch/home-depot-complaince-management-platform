-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "publicDashboardToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SiteSettings_publicDashboardToken_key" ON "SiteSettings"("publicDashboardToken");

