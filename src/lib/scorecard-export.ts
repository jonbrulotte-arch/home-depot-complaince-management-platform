import ExcelJS from "exceljs";
import type { ScorecardData } from "@/lib/scorecard";
import { shipmentRows } from "@/lib/scorecard-rules";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { formatDateRange, SHIPMENT_RANGES } from "@/lib/shipment-ranges";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const MONEY = '"$"#,##0.00';
const PCT = '0.00"%"';
const round = (n: number) => Math.round(n * 100) / 100;
const total = (values: number[]) => round(values.reduce((s, v) => s + v, 0));
const DECISIONS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DISPUTABLE: "Disputable",
  NOT_DISPUTABLE: "Not disputable",
  NEEDS_RESEARCH: "Needs research",
};

function header(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FF374151" } };
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };
  });
}

function widths(ws: ExcelJS.Worksheet, values: number[]) {
  values.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

/** Scorecard workbook: Scorecard, Violations, 12-Month Offsets and Team Influence sheets. */
export async function scorecardWorkbook(data: ScorecardData, status: { version: number; publishedAt: string | null }, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  wb.created = new Date(data.generatedAt);

  const sc = wb.addWorksheet("Scorecard", { views: [{ showGridLines: false }] });
  widths(sc, [34, 12, 14, 14, 12, 12, 16, 16, 12]);
  sc.addRow([`THD Compliance Scorecard - ${data.periodLabel}${data.periodBasis === "RECEIVED_MONTH" ? "" : ` (FM ${data.fiscalMonth})`}`]).font = TITLE_FONT;
  sc.addRow([
    `${status.publishedAt ? `Published ${status.publishedAt.slice(0, 10)}` : "Draft"} · version ${status.version} · generated ${data.generatedAt.slice(0, 10)}` +
      (data.dataReceivedAt ? ` · data received ${data.dataReceivedAt.slice(0, 10)}` : ""),
  ]).font = { color: { argb: "FF6B7280" } };
  sc.addRow([]);
  const totals: [string, number, string?][] = [
    ["Pre-dispute offsets", data.totals.preOffset, MONEY],
    ["Recovered in disputes", data.totals.recovered, MONEY],
    ["Post-dispute offsets", data.totals.postOffset, MONEY],
    ["Pending disputes", data.totals.pendingAmount, MONEY],
    ["Denied disputes", data.totals.deniedAmount, MONEY],
    ["Violations", data.totals.violations],
  ];
  for (const [label, value, fmt] of totals) {
    const row = sc.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    if (fmt) row.getCell(2).numFmt = fmt;
  }

  if (data.shipments?.programs.length) {
    const sh = data.shipments;
    sc.addRow([]);
    sc.addRow(["Shipments"]).font = { bold: true, size: 12 };
    for (const { key, label } of sh.ranges ? SHIPMENT_RANGES : []) sc.addRow([`${label} date range`, formatDateRange(sh.ranges![key])]);
    header(sc.addRow(["Mode", ...sh.programs.map((p) => p.name), "Total"]));
    for (const row of shipmentRows(sh)) {
      const added = sc.addRow(row.heading ? [row.label] : [row.label, ...row.values, row.total]);
      if (row.heading) added.font = { bold: true, color: { argb: "FF6B7280" } };
      if (row.bold) added.font = { bold: true };
    }
    if (sh.transportationLtl !== null) sc.addRow(["Transportation (RDC + DFC LTL)", sh.transportationLtl]);
    if (!sh.complete) sc.addRow(["Some shipment counts were not entered."]).font = { italic: true, color: { argb: "FFB45309" } };
  }

  for (const program of data.programs) {
    sc.addRow([]);
    sc.addRow([`${program.name}`, `${program.lines} ${data.shipments?.programs.some((p) => p.code === program.code && p.total !== null) ? "shipments" : "lines"}`]).font = { bold: true, size: 12 };
    header(sc.addRow(["Metric", "Goal", "Pre-dispute", "Post-dispute", "Result", "Violations", "Pre-dispute $", "Post-dispute $", "Disputed"]));
    for (const m of program.metrics) {
      const row = sc.addRow([
        m.name,
        m.goalPct == null ? null : m.goalPct,
        m.prePct,
        m.postPct,
        m.meetsGoal == null ? "" : m.meetsGoal ? "Meets goal" : "Below goal",
        m.violations,
        m.preOffset,
        m.postOffset,
        m.disputed,
      ]);
      [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = PCT));
      [7, 8].forEach((c) => (row.getCell(c).numFmt = MONEY));
      row.getCell(5).font = { color: { argb: m.meetsGoal === false ? "FFB91C1C" : "FF15803D" } };
    }
    const totalRow = sc.addRow(["Program total", null, null, null, null, program.violations, program.preOffset, program.postOffset]);
    totalRow.font = { bold: true };
    [7, 8].forEach((c) => (totalRow.getCell(c).numFmt = MONEY));
  }

  const vs = wb.addWorksheet("Violations");
  widths(vs, [26, 22, 14, 10, 12, 16, 16, 18, 30, 12, 50]);
  header(vs.addRow(["Program", "Metric", "PO #", "Site", "Offset", "Decision", "Team influence", "Dispute", "Reason code", "Recovered", "Notes"]));
  for (const v of data.violations) {
    const row = vs.addRow([
      v.program, v.metric, v.poNumber, v.dcNumber, v.offset, DECISIONS[v.disposition] ?? v.disposition,
      v.teamInfluence, v.disputeStatus ? DISPUTE_STATUS_LABELS[v.disputeStatus] : "Not disputed", v.reasonCode, v.recovered, v.notes,
    ]);
    [5, 10].forEach((c) => (row.getCell(c).numFmt = MONEY));
  }
  vs.autoFilter = { from: "A1", to: "K1" };
  vs.views = [{ state: "frozen", ySplit: 1 }];

  const ytd = wb.addWorksheet("12-Month Offsets");
  const codes = data.programs.map((p) => p.code);
  widths(ytd, [30, ...data.trend.map(() => 12), 14]);
  header(ytd.addRow(["Program", ...data.trend.map((t) => t.label), "12-mo total"]));
  for (const p of data.programs) {
    const values = data.trend.map((t) => t.byProgram[p.code] ?? 0);
    ytd.addRow([p.name, ...values, total(values)]);
  }
  const pre = data.trend.map((t) => total(codes.map((c) => t.byProgram[c] ?? 0)));
  ytd.addRow(["Pre-dispute total", ...pre, total(pre)]).font = { bold: true };
  const rec = data.trend.map((t) => t.recovered);
  ytd.addRow(["Recovered in disputes", ...rec, total(rec)]);
  ytd.eachRow((row, n) => n > 1 && row.eachCell((c, col) => col > 1 && (c.numFmt = MONEY)));

  const team = wb.addWorksheet("Team Influence");
  widths(team, [24, 12, 16]);
  header(team.addRow(["Team", "Lines", "Offsets"]));
  for (const t of data.teamInfluence) team.addRow([t.team, t.lines, t.amount]).getCell(3).numFmt = MONEY;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
