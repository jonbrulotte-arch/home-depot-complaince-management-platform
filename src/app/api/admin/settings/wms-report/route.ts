import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanReportUrl } from "@/lib/logistics/import";

const schema = z.object({ url: z.string().trim().max(1000).nullable() });

/** Sets (or clears) the WMS report link that Logistics › Sync WMS lines retrieves. */
export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const url = cleanReportUrl(body.data.url);
  if (body.data.url && !url) return badRequest("The link must be a web address starting with http:// or https://");
  await prisma.siteSettings.upsert({
    where: { id: "site" },
    create: { id: "site", wmsReportUrl: url, updatedById: guard.user.id },
    update: { wmsReportUrl: url, updatedById: guard.user.id },
  });
  await audit(guard.user.id, "settings.wmsReport", "SiteSettings", "site", { url });
  return NextResponse.json({ url });
}
