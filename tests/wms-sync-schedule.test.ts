import { describe, expect, it } from "vitest";
import { firstSyncAt, followingSyncAt, isSyncFrequency, syncFrequencyLabel, syncSummary, WMS_SYNC_OPTIONS } from "@/lib/logistics/sync-schedule";

const now = new Date("2026-11-17T15:00:00Z");

describe("WMS sync schedule", () => {
  it("offers off and fixed frequencies only", () => {
    expect(WMS_SYNC_OPTIONS[0].minutes).toBe(0);
    expect(isSyncFrequency(60)).toBe(true);
    expect(isSyncFrequency(7)).toBe(false);
    expect(syncFrequencyLabel(60)).toBe("Every hour");
  });
  it("starts now, or one interval after the last scheduled sync", () => {
    expect(firstSyncAt(0, null, now)).toBeNull();
    expect(firstSyncAt(60, null, now)).toEqual(now);
    expect(firstSyncAt(60, new Date("2026-11-17T14:30:00Z"), now)).toEqual(new Date("2026-11-17T15:30:00Z"));
    expect(firstSyncAt(15, new Date("2026-11-17T14:30:00Z"), now)).toEqual(now);
    expect(followingSyncAt(240, now)).toEqual(new Date("2026-11-17T19:00:00Z"));
  });
  it("summarises a sync", () => {
    expect(syncSummary({ rows: 1204, created: 12, updated: 1192, skipped: [] })).toBe("Synced 1,204 WMS line(s): 12 new, 1,192 updated");
    expect(syncSummary({ rows: 3, created: 0, updated: 2, skipped: [{}] })).toBe("Synced 3 WMS line(s): 0 new, 2 updated, 1 skipped");
  });
});
