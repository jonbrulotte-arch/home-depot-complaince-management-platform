import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest } from "@/lib/api";
import { audit } from "@/lib/audit";
import { MAX_LOGO_BYTES, sniffLogoType } from "@/lib/brand";

// multipart/form-data: enabled ("true"/"false"), siteName, optional logo file, removeLogo ("true")
export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Expected form data");

  const enabled = form.get("enabled") === "true";
  const siteName = String(form.get("siteName") ?? "").replace(/\s+/g, " ").trim();
  if (siteName.length > 60) return badRequest("Site name is limited to 60 characters");
  if (enabled && !siteName) return badRequest("Enter a site name to turn on custom branding");

  const data: { brandingEnabled: boolean; siteName: string | null; updatedById: string; logo?: Uint8Array<ArrayBuffer> | null; logoContentType?: string | null } = {
    brandingEnabled: enabled,
    siteName: siteName || null,
    updatedById: guard.user.id,
  };
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) return badRequest("The logo is limited to 1 MB");
    const bytes = new Uint8Array(await logo.arrayBuffer());
    const type = sniffLogoType(Buffer.from(bytes));
    if (!type) return badRequest("The logo must be a PNG, JPEG, GIF, WebP or SVG image");
    data.logo = bytes;
    data.logoContentType = type;
  } else if (form.get("removeLogo") === "true") {
    data.logo = null;
    data.logoContentType = null;
  }

  await prisma.siteSettings.upsert({ where: { id: "site" }, create: { id: "site", ...data }, update: data });
  await audit(guard.user.id, "settings.branding", "SiteSettings", "site", {
    enabled,
    siteName: data.siteName,
    logo: data.logo === undefined ? "unchanged" : data.logo ? `${data.logoContentType}, ${data.logo.length} bytes` : "removed",
  });
  return NextResponse.json({ ok: true });
}
