import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { BrandingSettings } from "./branding-settings";
import { ReportPeriodSettings } from "./report-period-settings";
import { PublicDashboardSettings } from "./public-dashboard-settings";
import { EmailSettings } from "./email-settings";
import { mailConfig } from "@/lib/mail";
import { SopSettings } from "./sop-settings";

export default async function SettingsPage() {
  await requirePagePermission("admin.settings");
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { brandingEnabled: true, siteName: true, logoContentType: true, updatedAt: true, reportPeriodBasis: true, publicDashboardToken: true } });
  const mail = mailConfig();
  const [sops, roles] = await Promise.all([
    prisma.sopDocument.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }], select: { id: true, title: true, fileName: true, size: true, roleIds: true, updatedAt: true } }),
    prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Platform-wide settings.</p>
      </div>
      <ReportPeriodSettings initial={s?.reportPeriodBasis ?? "RECEIVED_MONTH"} />
      <PublicDashboardSettings initialToken={s?.publicDashboardToken ?? null} />
      <SopSettings sops={sops.map((x) => ({ ...x, updatedAt: x.updatedAt.toISOString() }))} roles={roles} />
      <EmailSettings configured={Boolean(mail.config)} sender={mail.config?.sender ?? (process.env.MS_GRAPH_SENDER?.trim() || null)} missing={mail.missing} />
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
