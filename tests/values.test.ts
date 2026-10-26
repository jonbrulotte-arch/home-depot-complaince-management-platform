import { describe, expect, it } from "vitest";
import { normalizeHeader, toBoolean, toDate, toNumber, toText } from "@/lib/import/values";
import { calendarToFiscal, fiscalLabel, fiscalToCalendar, parseMonthLabel, shiftFiscalMonth } from "@/lib/fiscal";

describe("value coercion", () => {
  it("parses the date formats found in SPM exports as UTC wall time", () => {
    expect(toDate("06/02/2026")?.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    expect(toDate("10-28-2024")?.toISOString()).toBe("2024-10-28T00:00:00.000Z");
    expect(toDate("11/03/2024 12:51 PM")?.toISOString()).toBe("2024-11-03T12:51:00.000Z");
    expect(toDate("11/03/2024 12:05 AM")?.toISOString()).toBe("2024-11-03T00:05:00.000Z");
    expect(toDate("2025-02-11 05:47:38.000")?.toISOString()).toBe("2025-02-11T05:47:38.000Z");
    expect(toDate("229663843\n229686171")).toBeNull();
    expect(toDate("05/27/2025 08:52 AM\n05/28/2025 09:00 AM")?.toISOString()).toBe("2025-05-27T08:52:00.000Z");
    expect(toDate(45000)?.toISOString()).toBe("2023-03-15T00:00:00.000Z");
  });

  it("treats SPM blank markers as null", () => {
    for (const blank of ["-", "--", "Not Available", "", null]) {
      expect(toText(blank)).toBeNull();
      expect(toDate(blank)).toBeNull();
      expect(toNumber(blank)).toBeNull();
    }
    expect(toDate("02/30/2024")).toBeNull();
  });

  it("parses numbers, booleans and headers", () => {
    expect(toNumber("$1,000.50")).toBe(1000.5);
    expect(toNumber("98.5%")).toBe(98.5);
    expect(toNumber("abc")).toBeNull();
    expect(toBoolean("false")).toBe(false);
    expect(toBoolean(true)).toBe(true);
    expect(normalizeHeader("  Days to Wave\n(Wave Date -  PO Create Date) ")).toBe("days to wave (wave date - po create date)");
  });
});

describe("THD fiscal months (FM01 = February)", () => {
  it("maps fiscal months to calendar months and back", () => {
    expect(fiscalToCalendar(202408)).toEqual({ year: 2024, month: 8 }); // September
    expect(fiscalToCalendar(202412)).toEqual({ year: 2025, month: 0 }); // January
    expect(calendarToFiscal(2025, 0)).toBe(202412);
    expect(calendarToFiscal(2024, 1)).toBe(202401);
    expect(fiscalLabel(202605)).toBe("Jun 2026");
  });

  it("shifts across fiscal years and parses folder names", () => {
    expect(shiftFiscalMonth(202412, 1)).toBe(202501);
    expect(shiftFiscalMonth(202501, -1)).toBe(202412);
    expect(shiftFiscalMonth(202405, -11)).toBe(202306);
    expect(parseMonthLabel("Sep-2024")).toBe(202408);
    expect(parseMonthLabel("Sept-2025")).toBe(202508);
    expect(parseMonthLabel("July-2025")).toBe(202506);
    expect(parseMonthLabel("Jan-2026")).toBe(202512);
  });
});
