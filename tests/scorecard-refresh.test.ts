import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ audit: async () => {} }));
vi.mock("@/lib/scorecard", () => ({ buildScorecard: async () => ({}) }));

describe("refreshing published scorecards", () => {
  it("compares snapshots regardless of key order, ignoring when they were generated", async () => {
    const { comparable, stableJson } = await import("@/lib/scorecard-refresh");
    expect(stableJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null }, e: undefined })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
    const snap = { title: "Sep 2026", generatedAt: "2026-10-01T00:00:00Z", totals: { violations: 3, postOffset: 250 } };
    const stored = JSON.parse(JSON.stringify({ totals: { postOffset: 250, violations: 3 }, generatedAt: "2026-11-07T00:00:00Z", title: "Sep 2026" }));
    expect(comparable(snap as never)).toBe(comparable(stored));
    expect(comparable(snap as never)).not.toBe(comparable({ ...stored, totals: { ...stored.totals, postOffset: 0 } }));
  });
});
