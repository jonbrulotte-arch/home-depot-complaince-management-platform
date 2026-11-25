import ExcelJS from "exceljs";
import { fiscalLabel } from "@/lib/fiscal";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { CANCEL_SOURCE_LABELS, cancelTotals, groupCancellations, type CancelGroup, type CancelRow } from "@/lib/cancellations";

// Reports & Insights › Cancellations as a workbook: the filters and totals, every row, and the breakdowns.

const MONEY = '"$"#,##0.00';

function sheet(wb: ExcelJS.Workbook, name: string, columns: [string, number, "money"?][], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  for (const r of rows) ws.addRow(r);
  columns.forEach(([, , kind], i) => {
    if (kind === "money") ws.getColumn(i + 1).numFmt = MONEY;
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const groupSheet = (wb: ExcelJS.Workbook, name: string, first: string, groups: CancelGroup[]) =>
  sheet(
    wb,
    name,
    [[first, 36], ["Cancellations", 13], ["POs", 8], ["Units", 10], ["Order value", 14, "money"], ["THD offsets", 14, "money"], ["Recovered", 14, "money"], ["Net offsets", 14, "money"], ["Est. fines", 14, "money"], ["Disputed", 10]],
    groups.map((g) => [g.label, g.rows, g.pos, g.units, g.value, g.offsets, g.recovered, g.net, g.estimatedFines, g.disputed]),
  );

export async function cancellationsWorkbook(rows: CancelRow[], context: { timeFrame: string; program: string | null; filters: [string, string][]; /** Every cancellation recorded, whatever the filters */ all?: CancelRow[] }, siteName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const t = cancelTotals(rows);
  sheet(
    wb,
    "Summary",
    [["", 32], ["", 40]],
    [
      ["Cancellations: financial impact", ""],
      ["Time frame", context.timeFrame],
      ["Program", context.program ?? "All programs"],
      ...context.filters.map(([k, v]): [string, string] => [k, v]),
      ["", ""],
      ["Cancellations (PO and SKU)", t.rows],
      ["POs", t.pos],
      ["Units cancelled (POM)", t.units],
      ["Order value cancelled (units × POM unit cost)", t.value],
      ["THD offsets (Fill Rate charges)", t.offsets],
      ["Recovered through disputes", t.recovered],
      ["Net offsets", t.net],
      ["Estimated fines (Issue Log)", t.estimatedFines],
      ["Charged by THD", t.charged],
      ["Disputed", t.disputed],
      ...(context.all && context.all.length !== rows.length
        ? (() => {
            const a = cancelTotals(context.all);
            return [
              ["", ""],
              ["All cancellations recorded (no time frame or filters)", ""],
              ["Cancellations (PO and SKU)", a.rows],
              ["Units cancelled (POM)", a.units],
              ["Order value cancelled", a.value],
              ["THD offsets", a.offsets],
              ["Recovered", a.recovered],
              ["Net offsets", a.net],
              ["Estimated fines", a.estimatedFines],
            ] as (string | number)[][];
          })()
        : []),
    ],
  );
  sheet(
    wb,
    "Cancellations",
    [
      ["Month", 10], ["PO #", 13], ["Our SKU", 10], ["THD SKU", 13], ["Description", 34], ["Store/DC", 10], ["Program", 22], ["Sources", 26], ["Whole PO", 9], ["POM status", 11], ["Vendor #", 9], ["PO reason code", 10],
      ["Units", 8], ["Unit cost", 11, "money"], ["Order value", 13, "money"], ["THD offset", 13, "money"], ["Dispute", 14], ["Recovered", 13, "money"], ["Net offset", 13, "money"], ["Est. fine", 12, "money"],
      ["Team", 22], ["Root cause", 30], ["Issues", 40],
    ],
    rows.map((r) => [
      r.month ? fiscalLabel(r.month) : null, r.poNumber, r.ourSku, r.thdSku, r.description, r.destination, r.programName, r.sources.map((s) => CANCEL_SOURCE_LABELS[s]).join(", "), r.wholePo ? "Yes" : "No", r.pomStatus, r.vendorNumber, r.reasonCode,
      r.units || null, r.unitCost, r.value || null, r.offsets || null, r.disputeStatus ? DISPUTE_STATUS_LABELS[r.disputeStatus] : r.offsets ? "Not disputed" : null, r.recovered || null, r.net || null, r.estimatedFine || null,
      r.team, r.rootCause, r.issues.map((i) => `ISS-${String(i.number).padStart(4, "0")} ${i.category} (${i.status}): ${i.title}`).join("\n") || null,
    ]),
  );
  groupSheet(wb, "By month", "Month", groupCancellations(rows, (r) => (r.month ? String(r.month) : null), (k) => (k === "—" ? "No date" : fiscalLabel(Number(k))), "key"));
  groupSheet(wb, "By team", "Team responsible", groupCancellations(rows, (r) => r.team ?? "Not assigned"));
  groupSheet(wb, "By SKU", "SKU", groupCancellations(rows, (r) => r.ourSku ?? r.thdSku));
  groupSheet(wb, "By destination", "Store/DC", groupCancellations(rows, (r) => r.destination));
  groupSheet(wb, "By vendor and reason", "Vendor # · PO reason code", groupCancellations(rows, (r) => (r.vendorNumber || r.reasonCode ? `Vendor ${r.vendorNumber ?? "?"} · reason ${r.reasonCode ?? "?"}` : "Not in POM")));
  groupSheet(wb, "By root cause", "Root cause", groupCancellations(rows, (r) => r.rootCause ?? "Not recorded"));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
