import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { BrandingSettings } from "./branding-settings";

export default async function SettingsPage() {
  await requirePagePermission("admin.settings");
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { brandingEnabled: true, siteName: true, logoContentType: true, updatedAt: true } });
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide settings.</p>
      </div>
      <BrandingSettings
        initial={{
          enabled: s?.brandingEnabled ?? false,
          siteName: s?.siteName ?? "",
          logoUrl: s?.logoContentType ? `/api/branding/logo?v=${s.updatedAt.getTime()}` : null,
        }}
      />
    </div>
  );
}
