// Runs once when a Next.js server starts. Starts the scheduled WMS sync check (Node.js runtime only;
// set WMS_SCHEDULER=off to keep a process from running scheduled syncs).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.WMS_SCHEDULER === "off" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startWmsScheduler } = await import("./lib/logistics/wms-sync");
  startWmsScheduler();
}
