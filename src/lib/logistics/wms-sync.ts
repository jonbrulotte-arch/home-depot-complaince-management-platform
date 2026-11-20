import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fetchWmsReport } from "./import";
import { followingSyncAt, syncSummary } from "./sync-schedule";

// The scheduled WMS sync (Admin › Settings › WMS report link › Sync schedule). The server checks every
// minute (src/instrumentation.ts → startWmsScheduler); a run is claimed with one conditional UPDATE, so
// only one process runs it however many are up, and a run that fails waits for the next interval.

/** Claims the scheduled sync when it is due: its frequency when this caller should run it now, else null */
async function claimDueSync(now: Date): Promise<number | null> {
  const s = await prisma.siteSettings.findUnique({ where: { id: "site" }, select: { wmsSyncMinutes: true, wmsReportUrl: true } });
  if (!s || s.wmsSyncMinutes <= 0 || !s.wmsReportUrl) return null;
  const claimed = await prisma.siteSettings.updateMany({
    where: { id: "site", wmsSyncMinutes: s.wmsSyncMinutes, OR: [{ wmsSyncNextAt: null }, { wmsSyncNextAt: { lte: now } }] },
    data: { wmsSyncNextAt: followingSyncAt(s.wmsSyncMinutes, now) },
  });
  return claimed.count === 1 ? s.wmsSyncMinutes : null;
}

/** Runs the scheduled sync if it is due; records the result on SiteSettings (and failures in the App Log) */
export async function runScheduledWmsSync(now = new Date()): Promise<{ ran: boolean; ok?: boolean; message?: string }> {
  if ((await claimDueSync(now)) === null) return { ran: false };
  try {
    const r = await fetchWmsReport(null);
    const message = syncSummary(r);
    await prisma.siteSettings.update({ where: { id: "site" }, data: { wmsSyncLastAt: now, wmsSyncLastOk: true, wmsSyncLastMessage: message } });
    return { ran: true, ok: true, message };
  } catch (e) {
    const message = (e instanceof Error ? e.message : "The WMS sync failed").slice(0, 1000);
    await prisma.siteSettings.update({ where: { id: "site" }, data: { wmsSyncLastAt: now, wmsSyncLastOk: false, wmsSyncLastMessage: message } });
    await audit(null, "logistics.fetchWmsScheduledFailed", "SiteSettings", "site", { error: message });
    return { ran: true, ok: false, message };
  }
}

const TICK_MS = 60_000;
const g = globalThis as unknown as { wmsScheduler?: ReturnType<typeof setInterval> };

/** Starts the once-a-minute check in this server process (once, however often it is called) */
export function startWmsScheduler() {
  if (g.wmsScheduler) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runScheduledWmsSync();
      if (r.ran) console.log(`[wms-sync] ${r.ok ? r.message : `failed: ${r.message}`}`);
    } catch (e) {
      console.error("[wms-sync] check failed:", e instanceof Error ? e.message : e);
    } finally {
      running = false;
    }
  };
  g.wmsScheduler = setInterval(() => void tick(), TICK_MS);
  g.wmsScheduler.unref?.();
  setTimeout(() => void tick(), 15_000).unref?.();
}
