import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  clientId: z.string().trim().max(200),
  /** Empty keeps the saved secret */
  clientSecret: z.string().trim().max(500).optional(),
  testMode: z.boolean(),
  /** Removes the credentials */
  clear: z.boolean().optional(),
});

/** Saves the UPS Tracking API credentials. The secret is write-only: it is never returned. */
export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { clientId, clientSecret, testMode, clear } = body.data;
  const current = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { upsClientSecret: true } });
  const data = clear
    ? { upsClientId: null, upsClientSecret: null, upsTestMode: false }
    : { upsClientId: clientId || null, upsClientSecret: clientSecret || current?.upsClientSecret || null, upsTestMode: testMode };
  if (!clear && (!data.upsClientId || !data.upsClientSecret)) return badRequest("Enter the UPS client ID and client secret");
  await prisma.siteSettings.upsert({ where: { id: "site" }, create: { id: "site", ...data, updatedById: guard.user.id }, update: { ...data, updatedById: guard.user.id } });
  // The secret itself is never logged
  await audit(guard.user.id, "settings.ups", "SiteSettings", "site", { clientId: data.upsClientId, secretChanged: Boolean(clientSecret) || Boolean(clear), testMode: data.upsTestMode, cleared: Boolean(clear) });
  return NextResponse.json({ configured: !clear });
}
