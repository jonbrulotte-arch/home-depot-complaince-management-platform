import { describe, expect, it } from "vitest";
import { formatDateRange, isIsoDate, reportShipmentRanges, shiftIsoDate } from "@/lib/shipment-ranges";

describe("shipment date ranges", () => {
  it("shifts dates by months, clamping to the month's last day", () => {
    expect(shiftIsoDate("2026-07-01", -2)).toBe("2026-05-01");
    expect(shiftIsoDate("2026-07-31", -2)).toBe("2026-05-31");
    expect(shiftIsoDate("2026-04-30", -2)).toBe("2026-02-28");
    expect(shiftIsoDate("2026-01-15", -2)).toBe("2025-11-15");
  });

  it("only reads a range with both dates", () => {
    const d = (v: string) => new Date(`${v}T00:00:00Z`);
    expect(reportShipmentRanges({ fillOnTimeFrom: d("2026-05-03"), fillOnTimeTo: d("2026-05-30"), otherFrom: d("2026-07-05"), otherTo: null })).toEqual({
      fillOnTime: { from: "2026-05-03", to: "2026-05-30" },
      other: null,
    });
  });

  it("validates and formats dates", () => {
    expect(isIsoDate("2026-07-01")).toBe(true);
    expect(isIsoDate("07/01/2026")).toBe(false);
    expect(formatDateRange({ from: "2026-07-01", to: "2026-07-31" })).toBe("07/01/2026 - 07/31/2026");
    expect(formatDateRange(null)).toBe("Not entered");
  });
});
