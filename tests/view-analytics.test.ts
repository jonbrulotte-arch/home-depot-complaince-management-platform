import { describe, expect, it } from "vitest";
import { browserLabel, fillDays, parseRange } from "@/lib/view-analytics-shared";

describe("View Analytics", () => {
  it("accepts only the offered ranges", () => {
    expect(parseRange(undefined)).toBe(30);
    expect(parseRange("7")).toBe(7);
    expect(parseRange("0")).toBe(0);
    expect(parseRange("12")).toBe(30);
  });

  it("fills every day in the window, zero where nothing happened", () => {
    const days = fillDays([{ day: new Date("2026-10-02T00:00:00Z"), hits: 3, sessions: 2 }], new Date("2026-10-01T15:00:00Z"), new Date("2026-10-03T08:00:00Z"));
    expect(days).toEqual([
      { day: "2026-10-01", hits: 0, sessions: 0 },
      { day: "2026-10-02", hits: 3, sessions: 2 },
      { day: "2026-10-03", hits: 0, sessions: 0 },
    ]);
  });

  it("names the browser and system", () => {
    expect(browserLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Edge on Windows");
    expect(browserLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(browserLabel(null)).toBe("Unknown");
  });
});
