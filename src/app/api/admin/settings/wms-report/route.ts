import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanReportUrl } from "@/lib/logistics/import";
import { firstSyncAt, isSyncFrequency } from "@/lib/logistics/sync-schedule";

const schema = z.object({
  url: z.string().trim().max(1000).nullable(),
  /** Scheduled sync frequency in minutes (0 = off); unchanged when left out */
  syncMinutes: z.number().int().refine(isSyncFrequency, "Pick a sync frequency from the list").optional(),
});

/** Sets (or clears) the WMS report link that Logistics › Sync WMS lines retrieves, and how often it syncs on its own. */
export async function PUT(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const url = cleanReportUrl(body.data.url);
  if (body.data.url && !url) return badRequest("The link must be a web address starting with http:// or https://");
  const current = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { wmsSyncMinutes: true, wmsSyncLastAt: true } });
  const minutes = body.data.syncMinutes ?? current?.wmsSyncMinutes ?? 0;
  const schedule = { wmsSyncMinutes: minutes, wmsSyncNextAt: url ? firstSyncAt(minutes, current?.wmsSyncLastAt ?? null, new Date()) : null };
  await prisma.siteSettings.upsert({
    where: { id: "site" },
    create: { id: "site", wmsReportUrl: url, ...schedule, updatedById: guard.user.id },
    update: { wmsReportUrl: url, ...schedule, updatedById: guard.user.id },
  });
  await audit(guard.user.id, "settings.wmsReport", "SiteSettings", "site", { url, syncMinutes: minutes });
  return NextResponse.json({ url, syncMinutes: minutes, nextAt: schedule.wmsSyncNextAt });
}
