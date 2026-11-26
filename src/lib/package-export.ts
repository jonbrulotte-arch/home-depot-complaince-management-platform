import ExcelJS from "exceljs";
import { DEFAULT_SITE_NAME } from "@/lib/brand";
import type { PackageReport } from "@/lib/packages";
import { formatUtcDate } from "@/lib/utils";

const MONEY = '"$"#,##0.00';

/** A chargeback package's POs and offsets as an Excel workbook, one row per chargeback line. */
export async function packageWorkbook(pkg: PackageReport, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const ws = wb.addWorksheet("Package");

  ws.addRow([`Chargeback package ${pkg.packageId}`]).font = { bold: true, size: 14 };
  ws.addRow([`${pkg.totals.pos} PO(s) · ${pkg.totals.lines} chargeback line(s) · from ${pkg.slots.map((s) => `${s.report} (${s.program}, ${s.compliancePeriod})`).join("; ")}`]);
  ws.addRow([]);

  const columns: [string, number][] = [
    ["Package ID", 18], ["Report", 26], ["Program", 26], ["Compliance period", 20], ["Metric", 20], ["PO #", 14], ["PO create date", 14],
    ["SKU", 12], ["Description", 34], ["Site", 10], ["Fiscal month", 12], ["Offset", 12], ["Decision", 18], ["Team", 20], ["Root cause", 30],
    ["Dispute", 18], ["Amount disputed", 14], ["Recovered", 12], ["Net chargeback", 14],
  ];
  columns.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  const head = ws.addRow(columns.map(([h]) => h));
  head.font = { bold: true, color: { argb: "FF374151" } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });
  const headRow = head.number;

  for (const l of pkg.lines) {
    ws.addRow([
      pkg.packageId, l.report, l.program, l.compliancePeriod, l.metric, l.poNumber, l.poCreateDate ? formatUtcDate(l.poCreateDate) : null,
      l.sku, l.description, l.site, l.fiscalMonth, l.offset, l.decision, l.team, l.rootCause,
      l.disputeStatus ?? "Not disputed", l.amountDisputed, l.recovered, l.net,
    ]);
  }
  const totals = ws.addRow(["Total", ...Array(10).fill(null), pkg.totals.offset, ...Array(5).fill(null), null, pkg.totals.recovered, pkg.totals.net]);
  totals.font = { bold: true };
  ws.eachRow((row, n) => n > headRow && [12, 17, 18, 19].forEach((c) => (row.getCell(c).numFmt = MONEY)));
  ws.autoFilter = { from: { row: headRow, column: 1 }, to: { row: headRow, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: headRow }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
