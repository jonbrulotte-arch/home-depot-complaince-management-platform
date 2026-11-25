import ExcelJS from "exceljs";
import { fiscalLabel } from "@/lib/fiscal";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { CANCEL_SOURCE_LABELS, cancelTotals, groupCancellations, type CancelGroup, type CancelRow } from "@/lib/cancellations";

// Reports & Insights › Cancellations as a workbook: a Dashboard (headline figures, and the impact by
// month and SKU with in-cell data bars), every cancellation, and the breakdowns. Styled like the
// platform: dark headers, currency formats, banded rows, totals, frozen headers and filters.

const MONEY = '"$"#,##0.00';
const COUNT = "#,##0";
const BLUE = "FF2563EB";
const HEAD = "FF1F2937";
const BAND = "FFF9FAFB";
const BORDER = "FFE5E7EB";
const MUTED = "FF6B7280";

type Kind = "money" | "count" | "text";
type Col = { header: string; width: number; kind?: Kind };

const thin = { style: "thin" as const, color: { argb: BORDER } };

/** A styled table at a row: dark header, banded rows, formats, an optional bold total row; returns the first and last data rows */
function writeTable(ws: ExcelJS.Worksheet, at: number, cols: Col[], rows: (string | number | null)[][], total?: (string | number | null)[]) {
  const header = ws.getRow(at);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } };
    cell.alignment = { vertical: "middle", horizontal: c.kind && c.kind !== "text" ? "right" : "left", wrapText: true };
    cell.border = { bottom: thin };
  });
  header.height = 22;
  rows.forEach((r, n) => {
    const row = ws.getRow(at + 1 + n);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      const kind = cols[i]?.kind;
      if (kind === "money") cell.numFmt = MONEY;
      if (kind === "count") cell.numFmt = COUNT;
      cell.alignment = { vertical: "top", wrapText: kind === "text" || !kind };
      cell.border = { bottom: thin };
      if (n % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
    });
  });
  const last = at + rows.length;
  if (total) {
    const row = ws.getRow(last + 1);
    total.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true };
      if (cols[i]?.kind === "money") cell.numFmt = MONEY;
      if (cols[i]?.kind === "count") cell.numFmt = COUNT;
      cell.border = { top: { style: "medium", color: { argb: HEAD } } };
    });
  }
  return { first: at + 1, last };
}

/** In-cell bars for a column: Excel's own data bars, in the platform's blue */
function dataBars(ws: ExcelJS.Worksheet, column: string, first: number, last: number) {
  if (last < first) return;
  ws.addConditionalFormatting({
    ref: `${column}${first}:${column}${last}`,
    rules: [{ type: "dataBar", priority: 1, gradient: false, cfvo: [{ type: "num", value: 0 }, { type: "max" }], color: { argb: BLUE } } as unknown as ExcelJS.ConditionalFormattingRule],
  });
}

const GROUP_COLS = (first: string): Col[] => [
  { header: first, width: 40, kind: "text" },
  { header: "Cancellations", width: 13, kind: "count" },
  { header: "POs", width: 8, kind: "count" },
  { header: "Units", width: 10, kind: "count" },
  { header: "Order value", width: 16, kind: "money" },
  { header: "THD offsets", width: 15, kind: "money" },
  { header: "Recovered", width: 14, kind: "money" },
  { header: "Net offsets", width: 15, kind: "money" },
  { header: "Est. fines", width: 13, kind: "money" },
  { header: "Disputed", width: 10, kind: "count" },
];
const groupRow = (g: Pick<CancelGroup, "rows" | "pos" | "units" | "value" | "offsets" | "recovered" | "net" | "estimatedFines" | "disputed">, label: string) => [label, g.rows, g.pos, g.units, g.value, g.offsets, g.recovered, g.net, g.estimatedFines, g.disputed];

function groupSheet(wb: ExcelJS.Workbook, name: string, first: string, groups: CancelGroup[], total?: CancelGroup | ReturnType<typeof cancelTotals>) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = GROUP_COLS(first);
  ws.columns = cols.map((c) => ({ width: c.width }));
  const { first: a, last: b } = writeTable(ws, 1, cols, groups.map((g) => groupRow(g, g.label)), total ? groupRow(total, "Total") : undefined);
  dataBars(ws, "E", a, b);
  dataBars(ws, "H", a, b);
  if (groups.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

export async function cancellationsWorkbook(rows: CancelRow[], context: { timeFrame: string; program: string | null; filters: [string, string][]; /** Every cancellation recorded, whatever the filters */ all?: CancelRow[] }, siteName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const t = cancelTotals(rows);
  const months = groupCancellations(rows, (r) => (r.month ? String(r.month) : null), (k) => (k === "—" ? "No date" : fiscalLabel(Number(k))), "key");
  const skus = groupCancellations(rows, (r) => r.ourSku ?? r.thdSku, (k) => {
    const r = rows.find((x) => (x.ourSku ?? x.thdSku) === k);
    return r ? [r.ourSku, r.thdSku ? `THD ${r.thdSku}` : null, r.description].filter(Boolean).join(" · ") : k;
  });

  // Dashboard
  const ws = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 44 }, { width: 14 }, { width: 10 }, { width: 11 }, { width: 18 }, { width: 16 }, { width: 15 }, { width: 16 }, { width: 14 }, { width: 10 }];
  ws.getCell("A1").value = "Cancellations: financial impact";
  ws.getCell("A1").font = { bold: true, size: 18, color: { argb: HEAD } };
  ws.getCell("A2").value = [`Time frame: ${context.timeFrame}`, `Program: ${context.program ?? "All programs"}`, ...context.filters.map(([k, v]) => `${k}: ${v}`)].join("   ·   ");
  ws.getCell("A2").font = { color: { argb: MUTED } };
  ws.getCell("A3").value = `${siteName} · order value = cancelled units × POM unit cost; net offsets = THD offsets − recovered; rows count in the PO's create month (POM)`;
  ws.getCell("A3").font = { color: { argb: MUTED }, italic: true, size: 9 };
  // Headline figures: label over value, in a row of tiles
  const tiles: [string, number, string][] = [
    ["Cancellations", t.rows, COUNT],
    ["Units cancelled", t.units, COUNT],
    ["Order value lost", t.value, MONEY],
    ["THD offsets", t.offsets, MONEY],
    ["Recovered", t.recovered, MONEY],
    ["Net offsets", t.net, MONEY],
    ["Estimated fines", t.estimatedFines, MONEY],
  ];
  const tileCols = ["A", "B", "E", "F", "G", "H", "I"];
  tiles.forEach(([label, value, fmt], i) => {
    const l = ws.getCell(`${tileCols[i]}5`);
    l.value = label;
    l.font = { size: 9, color: { argb: MUTED } };
    const v = ws.getCell(`${tileCols[i]}6`);
    v.value = value;
    v.numFmt = fmt;
    v.font = { bold: true, size: 14, color: { argb: label === "THD offsets" && value ? "FFB91C1C" : HEAD } };
    for (const c of [l, v]) {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      c.border = { top: c === l ? thin : undefined, bottom: c === v ? thin : undefined, left: thin, right: thin };
    }
  });
  let row = 8;
  if (context.all && context.all.length !== rows.length) {
    const a = cancelTotals(context.all);
    ws.getCell(`A${row}`).value = `The time frame and filters leave out ${a.rows - t.rows} of ${a.rows} cancellations. All cancellations recorded: ${a.value.toLocaleString("en-US", { style: "currency", currency: "USD" })} order value, ${a.offsets.toLocaleString("en-US", { style: "currency", currency: "USD" })} THD offsets (net ${a.net.toLocaleString("en-US", { style: "currency", currency: "USD" })}).`;
    ws.getCell(`A${row}`).font = { color: { argb: "FFB45309" }, bold: true };
    row += 2;
  }
  const section = (title: string) => {
    ws.getCell(`A${row}`).value = title;
    ws.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: HEAD } };
    row += 1;
  };
  section("By month (order value and net offsets as bars)");
  const m = writeTable(ws, row, GROUP_COLS("Month"), months.map((g) => groupRow(g, g.label)), groupRow(t, "Total"));
  dataBars(ws, "E", m.first, m.last);
  dataBars(ws, "H", m.first, m.last);
  row = m.last + 3;
  section("Top 15 SKUs by order value");
  const s = writeTable(ws, row, GROUP_COLS("SKU"), skus.slice(0, 15).map((g) => groupRow(g, g.label)));
  dataBars(ws, "E", s.first, s.last);
  dataBars(ws, "H", s.first, s.last);
  row = s.last + 3;
  section("By vendor # and PO reason code (POM)");
  const v = writeTable(ws, row, GROUP_COLS("Vendor # · reason code"), groupCancellations(rows, (r) => (r.vendorNumber || r.reasonCode ? `Vendor ${r.vendorNumber ?? "?"} · reason ${r.reasonCode ?? "?"}` : "Not in POM")).map((g) => groupRow(g, g.label)), groupRow(t, "Total"));
  dataBars(ws, "E", v.first, v.last);

  // Every cancellation
  const detail = wb.addWorksheet("Cancellations", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  const cols: Col[] = [
    { header: "Month", width: 10, kind: "text" },
    { header: "PO #", width: 13, kind: "text" },
    { header: "Our SKU", width: 10, kind: "text" },
    { header: "THD SKU", width: 13, kind: "text" },
    { header: "Description", width: 34, kind: "text" },
    { header: "Store/DC", width: 10, kind: "text" },
    { header: "Program", width: 22, kind: "text" },
    { header: "Sources", width: 24, kind: "text" },
    { header: "Whole PO", width: 9, kind: "text" },
    { header: "POM status", width: 11, kind: "text" },
    { header: "Vendor #", width: 9, kind: "text" },
    { header: "PO reason code", width: 10, kind: "text" },
    { header: "Units", width: 9, kind: "count" },
    { header: "Unit cost", width: 11, kind: "money" },
    { header: "Order value", width: 14, kind: "money" },
    { header: "THD offset", width: 13, kind: "money" },
    { header: "Dispute", width: 14, kind: "text" },
    { header: "Recovered", width: 13, kind: "money" },
    { header: "Net offset", width: 13, kind: "money" },
    { header: "Est. fine", width: 12, kind: "money" },
    { header: "Team", width: 22, kind: "text" },
    { header: "Root cause", width: 30, kind: "text" },
    { header: "Issues", width: 40, kind: "text" },
  ];
  detail.columns = cols.map((c) => ({ width: c.width }));
  const d = writeTable(
    detail,
    1,
    cols,
    rows.map((r) => [
      r.month ? fiscalLabel(r.month) : null, r.poNumber, r.ourSku, r.thdSku, r.description, r.destination, r.programName, r.sources.map((x) => CANCEL_SOURCE_LABELS[x]).join(", "), r.wholePo ? "Yes" : "No", r.pomStatus, r.vendorNumber, r.reasonCode,
      r.units || null, r.unitCost, r.value || null, r.offsets || null, r.disputeStatus ? DISPUTE_STATUS_LABELS[r.disputeStatus] : r.offsets ? "Not disputed" : null, r.recovered || null, r.net || null, r.estimatedFine || null,
      r.team, r.rootCause, r.issues.map((i) => `ISS-${String(i.number).padStart(4, "0")} ${i.category} (${i.status}): ${i.title}`).join("\n") || null,
    ]),
    ["Total", null, null, null, null, null, null, null, null, null, null, null, t.units, null, t.value, t.offsets, null, t.recovered, t.net, t.estimatedFines, null, null, null],
  );
  dataBars(detail, "O", d.first, d.last);
  if (rows.length) detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  groupSheet(wb, "By month", "Month", months, t);
  groupSheet(wb, "By SKU", "SKU", skus, t);
  groupSheet(wb, "By team", "Team responsible", groupCancellations(rows, (r) => r.team ?? "Not assigned"), t);
  groupSheet(wb, "By destination", "Store/DC", groupCancellations(rows, (r) => r.destination), t);
  groupSheet(wb, "By vendor and reason", "Vendor # · PO reason code", groupCancellations(rows, (r) => (r.vendorNumber || r.reasonCode ? `Vendor ${r.vendorNumber ?? "?"} · reason ${r.reasonCode ?? "?"}` : "Not in POM")), t);
  groupSheet(wb, "By root cause", "Root cause", groupCancellations(rows, (r) => r.rootCause ?? "Not recorded"), t);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
