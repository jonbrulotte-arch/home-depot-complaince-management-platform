import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { scorecardWorkbook } from "@/lib/scorecard-export";
import { meetsGoal } from "@/lib/scorecard-rules";
import { scorecardPdf } from "@/lib/scorecard-pdf";
import type { ScorecardData } from "@/lib/scorecard";

const data: ScorecardData = {
  title: "Jun 2024 Compliance Report",
  fiscalMonth: 202405,
  periodLabel: "Jun 2024",
  dataReceivedAt: "2024-09-05T00:00:00.000Z",
  generatedAt: "2026-10-22T00:00:00.000Z",
  programs: [
    {
      code: "US_RDC",
      name: "US Rapid Deployment Center",
      lines: 5,
      violations: 4,
      preOffset: 1359.62,
      postOffset: 1214.98,
      metrics: [
        { code: "FILL_RATE", name: "Fill Rate", goalPct: 98, lines: 5, violations: 1, prePct: 93.83, postPct: 100, meetsGoal: true, preOffset: 144.64, postOffset: 0, disputed: 1, approved: 1 },
        { code: "ON_TIME", name: "On Time", goalPct: 90, lines: 5, violations: 3, prePct: 40, postPct: 40, meetsGoal: false, preOffset: 1214.98, postOffset: 1214.98, disputed: 0, approved: 0 },
      ],
    },
  ],
  totals: { lines: 5, violations: 4, preOffset: 1359.62, postOffset: 1214.98, disputedAmount: 144.64, recovered: 144.64, deniedAmount: 0, pendingAmount: 0, pendingDisputes: 0 },
  violations: [
    { program: "US Rapid Deployment Center", metric: "Fill Rate", poNumber: "2015449080", dcNumber: "5851", offset: 144.64, disposition: "DISPUTABLE", teamInfluence: "Warehouse", disputeStatus: "APPROVED", reasonCode: "Order Shipped Complete", recovered: 144.64, notes: "POD attached" },
  ],
  shipments: {
    programs: [{ code: "US_RDC", name: "US Rapid Deployment Center", smallParcel: 0, ltl: 5, total: 5 }],
    totals: { smallParcel: 0, ltl: 5, total: 5 },
    transportationLtl: 5,
    complete: true,
    ranges: { fillOnTime: { from: "2024-04-01", to: "2024-04-30" }, other: null },
  },
  teamInfluence: [{ team: "Warehouse", amount: 144.64, lines: 1 }],
  trend: [{ fiscalMonth: 202405, label: "Jun 2024", byProgram: { US_RDC: 1359.62 }, preOffset: 1359.62, recovered: 144.64 }],
};

describe("scorecard export", () => {
  it("writes the scorecard, violations, 12-month and team sheets", async () => {
    const buffer = await scorecardWorkbook(data, { version: 2, publishedAt: "2026-10-22T00:00:00.000Z" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Scorecard", "Violations", "12-Month Offsets", "Team Influence"]);

    const sc = wb.getWorksheet("Scorecard")!;
    expect(sc.getCell("A1").value).toBe("THD Compliance Scorecard - Jun 2024 (FM 202405)");
    const values = sc.getSheetValues().flat().filter((v) => v !== undefined && v !== null);
    expect(values).toContain("Below goal");
    expect(values).toContain(1214.98);
    expect(values).toContain("04/01/2024 - 04/30/2024");
    expect(values).toContain("Not entered");

    const vs = wb.getWorksheet("Violations")!;
    expect(vs.getRow(2).getCell(3).value).toBe("2015449080");
    expect(vs.getRow(2).getCell(8).value).toBe("Approved");
    expect(wb.getWorksheet("12-Month Offsets")!.getRow(3).getCell(2).value).toBe(1359.62);
  });
});

describe("meeting the goal", () => {
  const base = { thresholdPct: 98, postDisputePct: null, offsetType: "PCT_VALUE" as const, nonCompliant: 3, approved: 0, postDisputeOffset: 0 };
  it("uses the recalculated percentage when there is one", () => {
    expect(meetsGoal({ ...base, postDisputePct: 98.2 })).toBe(true);
    expect(meetsGoal({ ...base, postDisputePct: 97.9 })).toBe(false);
  });
  it("only fails a percentage metric without a denominator when THD charged an offset", () => {
    expect(meetsGoal(base)).toBeNull();
    expect(meetsGoal({ ...base, postDisputeOffset: 20 })).toBe(false);
  });
  it("fails per-violation metrics while any violation stands", () => {
    const flat = { ...base, thresholdPct: 100, offsetType: "FLAT" as const };
    expect(meetsGoal({ ...flat, nonCompliant: 1, approved: 0 })).toBe(false);
    expect(meetsGoal({ ...flat, nonCompliant: 1, approved: 1 })).toBe(true);
  });
});

describe("scorecard PDF", () => {
  it("renders a PDF with every section", async () => {
    const pdf = await scorecardPdf(data, { version: 2, publishedAt: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("paginates long violation lists", async () => {
    const many = { ...data, violations: Array.from({ length: 120 }, () => data.violations[0]) };
    const pdf = await scorecardPdf(many, { version: 1, publishedAt: null });
    const pages = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
    expect(pages.length).toBeGreaterThan(2);
  });
});
