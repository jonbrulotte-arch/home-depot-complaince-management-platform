import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchWmsReport, wmsReportUrl } from "../src/lib/logistics/import";
import { refreshUpsTracking, upsConfigured } from "../src/lib/logistics/ups";

// `npm run logistics-refresh` (e.g. hourly from cron): pulls the WMS report from WMS_REPORT_URL and
// refreshes UPS tracking. Either part is skipped when it isn't set up in .env.
async function main() {
  if (wmsReportUrl()) {
    const r = await fetchWmsReport(null);
    console.log(`WMS: ${r.rows} carton line(s), ${r.created} new, ${r.updated} updated${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
  } else console.log("WMS: WMS_REPORT_URL isn't set; skipped");
  if (upsConfigured()) {
    const u = await refreshUpsTracking();
    console.log(`UPS: checked ${u.checked} of ${u.numbers} number(s)${u.errors ? `, ${u.errors} error(s)` : ""}${u.remaining ? `, ${u.remaining} left for the next run` : ""}`);
  } else console.log("UPS: UPS_CLIENT_ID / UPS_CLIENT_SECRET aren't set; skipped");
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
