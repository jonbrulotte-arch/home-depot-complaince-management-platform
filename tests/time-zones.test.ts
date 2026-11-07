import { describe, expect, it } from "vitest";
import { COMMON_TIME_ZONES, FALLBACK_TIME_ZONE, allTimeZones, effectiveTimeZone, isTimeZone, timeZoneLabel, utcOffset } from "@/lib/time-zones";
import { formatDate, formatDateTime } from "@/lib/utils";

const at = new Date("2026-11-02T22:28:00Z"); // after US daylight time ended

describe("time zones", () => {
  it("accepts IANA zones and rejects anything else", () => {
    expect(isTimeZone("America/Los_Angeles")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("America/Not_A_Place")).toBe(false);
    expect(isTimeZone("America%2FNew_York")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(null)).toBe(false);
    expect(isTimeZone("x".repeat(65))).toBe(false);
    for (const tz of COMMON_TIME_ZONES) expect(isTimeZone(tz)).toBe(true);
    expect(isTimeZone(FALLBACK_TIME_ZONE)).toBe(true);
  });

  it("uses the user's choice, else the browser's zone, else the default", () => {
    expect(effectiveTimeZone("Asia/Tokyo", "America/New_York", "America/Los_Angeles")).toBe("Asia/Tokyo");
    expect(effectiveTimeZone(null, "America/New_York", "America/Los_Angeles")).toBe("America/New_York");
    expect(effectiveTimeZone(null, "Not/AZone", "America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(effectiveTimeZone(undefined, undefined, "America/Los_Angeles")).toBe("America/Los_Angeles");
  });

  it("labels zones with their offset at a moment", () => {
    expect(utcOffset("America/Los_Angeles", at)).toBe("UTC−08:00");
    expect(utcOffset("America/Los_Angeles", new Date("2026-07-01T12:00:00Z"))).toBe("UTC−07:00");
    expect(utcOffset("UTC", at)).toBe("UTC+00:00");
    expect(utcOffset("Asia/Kolkata", at)).toBe("UTC+05:30");
    expect(timeZoneLabel("America/New_York", at)).toBe("America/New York (UTC−05:00)");
  });

  it("lists every zone with UTC", () => {
    const all = allTimeZones();
    expect(all).toContain("UTC");
    expect(all).toContain("America/Chicago");
  });

  it("formats app timestamps in the viewer's zone", () => {
    expect(formatDateTime(at, "America/Los_Angeles")).toBe("Nov 2, 2026, 02:28 PM");
    expect(formatDateTime(at, "America/New_York")).toBe("Nov 2, 2026, 05:28 PM");
    expect(formatDateTime(at, "Asia/Tokyo")).toBe("Nov 3, 2026, 07:28 AM");
    expect(formatDate(at, "Asia/Tokyo")).toBe("Nov 3, 2026");
    expect(formatDate(at, "America/Los_Angeles")).toBe("Nov 2, 2026");
    expect(formatDateTime(null, "UTC")).toBe("—");
  });
});
