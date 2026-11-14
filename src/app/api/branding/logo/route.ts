import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";

// Public while custom branding is on: the login page shows the logo before anyone signs in.
// While it is off, only people who manage settings can see the stored logo (for the preview).
export async function GET() {
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { brandingEnabled: true, logo: true, logoContentType: true } });
  if (!s?.logo || !s.logoContentType) return NextResponse.json({ error: "No logo" }, { status: 404 });
  if (!s.brandingEnabled && !(await getCurrentUser())?.permissions.has("admin.settings")) {
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(s.logo), {
    headers: {
      "Content-Type": s.logoContentType,
      "X-Content-Type-Options": "nosniff",
      // An SVG opened directly must not run scripts
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      // URLs carry a version, so the image can be cached
      "Cache-Control": s.brandingEnabled ? "public, max-age=86400" : "private, no-store",
    },
  });
}
