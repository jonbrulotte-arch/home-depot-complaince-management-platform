import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchWmsReport, wmsReportUrl } from "../src/lib/logistics/import";
import { refreshUpsTracking, upsConfigured } from "../src/lib/logistics/ups";

// `npm run logistics-refresh` (e.g. hourly from cron): pulls the WMS report from the link set under
// Admin › Settings (unless a sync schedule is set there: the server then syncs it itself) and
// refreshes UPS tracking. Either part is skipped when it isn't set up under Admin › Settings.
async function main() {
  const schedule = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { wmsSyncMinutes: true } });
  if (schedule?.wmsSyncMinutes) console.log("WMS: synced on the schedule set under Admin › Settings; skipped here");
  else if (await wmsReportUrl()) {
    const r = await fetchWmsReport(null);
    console.log(`WMS: ${r.rows} carton line(s), ${r.created} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
  } else console.log("WMS: no WMS report link under Admin › Settings; skipped");
  if (await upsConfigured()) {
    const u = await refreshUpsTracking();
    console.log(`UPS: checked ${u.checked} of ${u.numbers} number(s)${u.errors ? `, ${u.errors} error(s)` : ""}${u.remaining ? `, ${u.remaining} left for the next run` : ""}`);
  } else console.log("UPS: no UPS credentials under Admin › Settings; skipped");
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
