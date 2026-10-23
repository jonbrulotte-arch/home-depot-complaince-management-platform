import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseWorkbook } from "@/lib/import/parse";
import { classifyLine, detectExportKind, detectProgram, resolveAliases, transformWorkbook, type ImportPreview } from "@/lib/import/transform";
import { catalogConfig } from "./catalog-config";

const { programs, aliases } = catalogConfig();

async function load(file: string, programCode: string, fallbackFiscalMonth = 202410, period?: "FILL_ON_TIME" | "OTHER"): Promise<ImportPreview> {
  const wb = await parseWorkbook(readFileSync(path.join(__dirname, "fixtures", file)));
  const program = programs.find((p) => p.code === programCode)!;
  return transformWorkbook(wb, { fileName: file, program, aliases, fallbackFiscalMonth, period });
}

const metric = (p: ImportPreview, code: string) => p.metrics.find((m) => m.code === code)!;

describe("program and export detection", () => {
  it("uses the longest SPM filename prefix", () => {
    expect(detectProgram("US_DS_EXPORT_ALL_FILTERED_ALL_RESULTS_RECORDS_PVENDOR_875062.xlsx", [], programs)?.code).toBe("US_DS");
    expect(detectProgram("US_DFC_ON_TIME_FILTERED_NON_COMPLIANT_RECORDS_PVENDOR_875062 (1).xlsx", [], programs)?.code).toBe("US_DFC");
    expect(detectProgram("US_TRANS_ROUTING_GUIDE_FILTERED_NON_COMPLIANT_RECORDS.xlsx", [], programs)?.code).toBe("US_TRANS");
    expect(detectProgram("export.xlsx", ["ROUTING GUIDE", "PARCEL PO"], programs)?.code).toBe("US_TRANS");
  });

  it("reads the export kind from the filename", () => {
    expect(detectExportKind("US_DFC_EXPORT_ALL_FILTERED_NON_COMPLIANT_RECORDS.xlsx")).toBe("NON_COMPLIANT");
    expect(detectExportKind("US_DFC_EXPORT_ALL_FILTERED_ALL_RESULTS_RECORDS.xlsx")).toBe("ALL_RESULTS");
    expect(detectExportKind("US_DS_EXPORT_ALL_FILTERED_COMPLIANT_RECORDS.xlsx")).toBe("UNKNOWN");
  });
});

describe("column aliases", () => {
  it("prefers metric over program over global mappings", () => {
    const map = resolveAliases(
      [
        { programId: null, metricId: null, sourceHeader: "Offset", canonicalField: "offset" },
        { programId: "P", metricId: null, sourceHeader: "offset", canonicalField: "reason" },
        { programId: null, metricId: "M", sourceHeader: "OFFSET", canonicalField: "lateReason" },
        { programId: null, metricId: "OTHER", sourceHeader: "offset", canonicalField: "sku" },
      ],
      "P",
      "M",
    );
    expect(map.get("offset")).toBe("lateReason");
  });
});

describe("classification", () => {
  it("flags fill-rate shortfalls, cancellations and late shipments", () => {
    expect(classifyLine("FILL_RATE", { fillRatePct: 100 }, 0, true, "ALL_RESULTS")).toBe(true);
    expect(classifyLine("FILL_RATE", { fillRatePct: 0 }, 0, true, "ALL_RESULTS")).toBe(false);
    expect(classifyLine("FILL_RATE", { cancelDate: new Date() }, 0, true, "ALL_RESULTS")).toBe(false);
    expect(classifyLine("ON_TIME", { businessDaysLate: 1 }, 0, true, "ALL_RESULTS")).toBe(false);
    expect(classifyLine("ON_TIME", { lateReason: "LATE RTS" }, 0, true, "ALL_RESULTS")).toBe(false);
    expect(classifyLine("ON_TIME", {}, 0, true, "ALL_RESULTS")).toBe(true);
  });

  it("treats violation-list sheets and non-compliant exports as violations", () => {
    expect(classifyLine("ASNT_MISSING_ASN", {}, 1000, true, "ALL_RESULTS")).toBe(false);
    expect(classifyLine("SPECS_IMAGES", {}, 0, false, "UNKNOWN")).toBe(false);
    expect(classifyLine("MULTIPLE_BOL", {}, 0, true, "ALL_RESULTS")).toBe(true);
    expect(classifyLine("ON_TIME", {}, 0, true, "NON_COMPLIANT")).toBe(false);
    expect(classifyLine("ON_TIME", { spmStatus: "Pending Supplier" }, 0, true, "ALL_RESULTS")).toBe(true);
    expect(classifyLine("ON_TIME", { spmStatus: "Not Disputed" }, 0, true, "ALL_RESULTS")).toBe(false);
  });
});

describe("real SPM exports", () => {
  it("reads RDC fill rate and on time with the multi-block summary", async () => {
    const p = await load("rdc-all-results_ALL_RESULTS.xlsx", "US_RDC");
    expect(p.exportKind).toBe("ALL_RESULTS");
    expect(p.fiscalMonths).toEqual({ 202405: 10 });
    expect(metric(p, "FILL_RATE")).toMatchObject({ total: 5, nonCompliant: 1, offset: 144.64 });
    expect(metric(p, "ON_TIME")).toMatchObject({ total: 5, nonCompliant: 3, offset: 1214.98 });
    expect(p.summary.filter((s) => s.mVendor === null)).toHaveLength(2);
    expect(p.summary.find((s) => s.mVendor === "20377" && s.metricLabel === "ON TIME")).toMatchObject({ thresholdPct: 90, preDisputePerfPct: 40 });
    // Offsets reconcile with THD's own summary, so there is nothing to warn about
    expect(p.warnings).toEqual([]);
  });

  it("recovers offsets THD's US_TRANS export shifts under the department column", async () => {
    const p = await load("trans-multiple-bol-shifted_ALL_RESULTS.xlsx", "US_TRANS");
    expect(metric(p, "MULTIPLE_BOL")).toMatchObject({ total: 4, nonCompliant: 2, offset: 150 });
    expect(p.lines.every((l) => l.po?.dept === "23")).toBe(true);
    expect(p.warnings.join(" ")).toMatch(/column shift/);
  });

  it("ignores notes typed in unheaded columns", async () => {
    const p = await load("trans-stray-notes_ALL_RESULTS.xlsx", "US_TRANS");
    expect(metric(p, "MULTIPLE_BOL")).toMatchObject({ total: 2, nonCompliant: 2, offset: 150 });
  });

  it("drops hand-added subtotal and recap rows", async () => {
    const p = await load("dfc-on-time-annotated_NON_COMPLIANT.xlsx", "US_DFC");
    expect(metric(p, "ON_TIME")).toMatchObject({ total: 17, nonCompliant: 17, offset: 3388.97 });
    expect(p.warnings.join(" ")).toMatch(/ignored 11 sparse row/);
  });

  it("imports a single late ASN violation", async () => {
    const p = await load("dfc-late-asn_NON_COMPLIANT.xlsx", "US_DFC");
    expect(p.exportKind).toBe("NON_COMPLIANT");
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ metricCode: "ASNT_LATE_ASN", fiscalMonth: 202605, isCompliant: false, offsetAmount: 250 });
    expect(p.lines[0].po?.poNumber).toBeTruthy();
  });

  it("uses the fallback fiscal month for Drop Ship exports and keeps compliant lines", async () => {
    const p = await load("ds-all-results_ALL_RESULTS.xlsx", "US_DS", 202410);
    expect(p.fiscalMonths).toEqual({ 202410: 565 });
    expect(metric(p, "ON_TIME")).toMatchObject({ total: 561, nonCompliant: 0 });
    expect(metric(p, "FILL_RATE")).toMatchObject({ total: 4, nonCompliant: 4 });
    expect(p.emptySheets).toContain("LTL Routing Guide");
  });

  it("judges the legacy ASN Timeliness sheet by timestamps", async () => {
    const p = await load("dfc-legacy-asn_ALL_RESULTS.xlsx", "US_DFC");
    expect(metric(p, "ASN_TIMELINESS")).toMatchObject({ total: 14, nonCompliant: 0 });
  });

  it("builds stable, unique line keys", async () => {
    const a = await load("rdc-annotated_ALL_RESULTS.xlsx", "US_RDC");
    const b = await load("rdc-annotated_ALL_RESULTS.xlsx", "US_RDC");
    expect(a.lines.map((l) => l.lineKey)).toEqual(b.lines.map((l) => l.lineKey));
    const keys = a.lines.map((l) => `${l.metricId}|${l.lineKey}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(metric(a, "ON_TIME")).toMatchObject({ offset: 9022.91 });
    expect(metric(a, "ASNT_LATE_ASN")).toMatchObject({ nonCompliant: 3, offset: 750 });
  });
});

describe("summary-only exports", () => {
  it("records each metric with offsets as one line from THD's totals", async () => {
    const p = await load("dfc-summary-only_SUM.xlsx", "US_DFC", 202604);
    expect(p.exportKind).toBe("NON_COMPLIANT");
    expect(p.lines).toHaveLength(1);
    const [line] = p.lines;
    expect(line).toMatchObject({ metricCode: "ASNT_MISSING_ASN", fiscalMonth: 202604, isCompliant: false, offsetAmount: 1000, po: null, sourceSheet: "Summary" });
    expect(metric(p, "ASNT_MISSING_ASN").offset).toBe(1000);
    expect(p.warnings.some((w) => w.startsWith("Summary-only export"))).toBe(true);
  });
});

describe("compliance period imports", () => {
  it("takes Fill Rate and On Time in the On-Time & Fill Rate import", async () => {
    const p = await load("rdc-all-results_ALL_RESULTS.xlsx", "US_RDC", 202410, "FILL_ON_TIME");
    expect(p.lines.some((l) => l.updateOnly)).toBe(false);
    expect(p.fiscalMonths).toEqual({ 202405: 10 });
    expect(p.metrics.some((m) => m.outOfPeriod)).toBe(false);
  });

  it("makes the other period's sheets update-only", async () => {
    const p = await load("rdc-all-results_ALL_RESULTS.xlsx", "US_RDC", 202410, "OTHER");
    expect(p.lines.every((l) => l.updateOnly)).toBe(true);
    expect(metric(p, "FILL_RATE").outOfPeriod).toBe(true);
    // Update-only lines don't count toward the import's fiscal months
    expect(p.fiscalMonths).toEqual({});
    expect(p.warnings.some((w) => w.startsWith("Fill Rate belongs to the On-Time & Fill Rate import"))).toBe(true);

    const asn = await load("dfc-late-asn_NON_COMPLIANT.xlsx", "US_DFC", 202410, "FILL_ON_TIME");
    expect(asn.lines.length).toBeGreaterThan(0);
    expect(asn.lines.every((l) => l.updateOnly)).toBe(true);
  });

  it("imports everything when no period is given (backfill)", async () => {
    const p = await load("rdc-all-results_ALL_RESULTS.xlsx", "US_RDC");
    expect(p.lines.some((l) => l.updateOnly)).toBe(false);
  });
});

describe("Invoice Timeliness exports", () => {
  it("is detected from the US_INVOICE_TIMELINESS prefix", () => {
    expect(detectProgram("US_INVOICE_TIMELINESS_RECORDS_PVENDOR_875062_All_Week_2026_10_23_09_29_26.xlsx", ["All LOC"], programs)?.code).toBe("INVOICE_TIMELINESS");
  });

  it("maps every column and counts each PO on the report as a violation", async () => {
    const p = await load("invoice-timeliness_RECORDS.xlsx", "INVOICE_TIMELINESS", 202608);
    expect(p.exportKind).toBe("NON_COMPLIANT");
    expect(p.warnings).toEqual([]);
    expect(metric(p, "INVOICE_TIMELINESS")).toMatchObject({ sheet: "All LOC", total: 1, nonCompliant: 1, offset: 0, unmappedHeaders: [] });
    const [line] = p.lines;
    expect(line).toMatchObject({ fiscalMonth: 202608, isCompliant: false, offsetAmount: 0 });
    expect(line.fields).toMatchObject({ poNumber: "72936404", dcNumber: "8119", locationType: "HD.COM", weeksOnReport: 12 });
    expect(line.fields.goodsReceiptDate?.toISOString().slice(0, 10)).toBe("2026-07-22");
    expect(line.fields.firstReportedDate?.toISOString().slice(0, 10)).toBe("2026-07-25");
    expect(line.fields.lastReportedDate?.toISOString().slice(0, 10)).toBe("2026-10-17");
    expect(line.po).toMatchObject({ mVendor: "60003126", mVendorName: "JS PRODUCTS, INC" });
  });
});
