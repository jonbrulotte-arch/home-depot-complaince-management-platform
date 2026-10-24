import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_NAME, type Branding } from "@/lib/brand";

export { DEFAULT_SITE_NAME, type Branding };

/** Effective branding for this request; the default Sympl CM look when custom branding is off. */
export const getBranding = cache(async (): Promise<Branding> => {
  const s = await prisma.siteSettings.findUnique({
    where: { id: "site" },
    select: { brandingEnabled: true, siteName: true, logoContentType: true, updatedAt: true },
  });
  if (!s?.brandingEnabled) return { custom: false, siteName: DEFAULT_SITE_NAME, logoUrl: null };
  return {
    custom: true,
    siteName: s.siteName?.trim() || DEFAULT_SITE_NAME,
    logoUrl: s.logoContentType ? `/api/branding/logo?v=${s.updatedAt.getTime()}` : null,
  };
});
