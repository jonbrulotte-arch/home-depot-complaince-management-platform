// The scheduled WMS sync's frequency choices and timing. Pure (unit-tested) and safe in the browser.

/** Frequencies offered under Admin › Settings, in minutes; 0 = off */
export const WMS_SYNC_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "Off (sync by hand)" },
  { minutes: 15, label: "Every 15 minutes" },
  { minutes: 30, label: "Every 30 minutes" },
  { minutes: 60, label: "Every hour" },
  { minutes: 120, label: "Every 2 hours" },
  { minutes: 240, label: "Every 4 hours" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 720, label: "Every 12 hours" },
  { minutes: 1440, label: "Once a day" },
];

export const isSyncFrequency = (minutes: number) => WMS_SYNC_OPTIONS.some((o) => o.minutes === minutes);

export const syncFrequencyLabel = (minutes: number) => WMS_SYNC_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `Every ${minutes} minutes`;

/**
 * When the next scheduled sync is due after the frequency is set: one interval after the last
 * scheduled run, or now when there was none or that time has passed. Null when the schedule is off.
 */
export function firstSyncAt(minutes: number, lastAt: Date | null, now: Date): Date | null {
  if (minutes <= 0) return null;
  if (!lastAt) return now;
  const next = new Date(lastAt.getTime() + minutes * 60_000);
  return next > now ? next : now;
}

/** The next run after one starting now */
export const followingSyncAt = (minutes: number, now: Date) => new Date(now.getTime() + minutes * 60_000);

/** "Synced 1,204 WMS line(s): 12 new, 1,192 updated" */
export function syncSummary(r: { rows: number; created: number; updated: number; skipped: unknown[] }): string {
  const n = (x: number) => x.toLocaleString("en-US");
  return `Synced ${n(r.rows)} WMS line(s): ${n(r.created)} new, ${n(r.updated)} updated${r.skipped.length ? `, ${n(r.skipped.length)} skipped` : ""}`;
}
