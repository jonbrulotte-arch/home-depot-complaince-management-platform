import ExcelJS from "exceljs";
import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { fiscalLabel } from "@/lib/fiscal";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import {
  byMonth,
  disputePipeline,
  figures,
  goalPerformance,
  groupBy,
  isViolation,
  issueInsights,
  metricKey,
  programKey,
  repeatPos,
  rootCauses,
  teamKey,
  winRate,
  type Figures,
} from "@/lib/insights";
import { fiscalMonthOf, type Insights } from "@/lib/insights-data";
import { formatUtcDate } from "@/lib/utils";

// Reports & Insights as a workbook: one sheet per view, for the time frame and program chosen.

const MONEY = '"$"#,##0.00';
const PCT = '0.0"%"';

type Kind = "text" | "int" | "money" | "pct";

function sheet(wb: ExcelJS.Workbook, name: string, title: string, columns: [string, number, Kind?][], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name);
  columns.forEach(([, w, kind], i) => {
    const col = ws.getColumn(i + 1);
    col.width = w;
    if (kind === "money") col.numFmt = MONEY;
    if (kind === "pct") col.numFmt = PCT;
  });
  ws.addRow([title]).font = { bold: true, size: 13, color: { argb: "FF111827" } };
  ws.addRow([]);
  const head = ws.addRow(columns.map(([h]) => h));
  head.font = { bold: true, color: { argb: "FF374151" } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });
  for (const r of rows) ws.addRow(r).alignment = { vertical: "top", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 3 }];
  return ws;
}

const FIG_COLS: [string, number, Kind][] = [
  ["Violations", 12, "int"],
  ["Offsets", 14, "money"],
  ["Recovered", 14, "money"],
  ["Net", 14, "money"],
  ["Disputed", 11, "int"],
  ["Won", 8, "int"],
  ["Win rate", 10, "pct"],
];
const figRow = (f: Figures) => [f.violations, f.offsets, f.recovered, f.net, f.disputed, f.won, winRate(f)];

export async function insightsWorkbook(data: Insights, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const scope = `${data.frame.label} · ${data.programs.find((p) => p.code === data.programCode)?.name ?? "All programs"}`;
  const now = figures(data.lines);

  sheet(wb, "Summary", `Reports & Insights · ${scope}`, [["Figure", 34], ["Value", 18]], [
    ["Violations", now.violations],
    ["Offsets", now.offsets],
    ["Recovered in disputes", now.recovered],
    ["Net (offsets − recovered)", now.net],
    ["Violations disputed", now.disputed],
    ["Disputes decided", now.decided],
    ["Disputes won (approved or partly)", now.won],
    ["Dispute win rate %", winRate(now) === null ? null : Math.round(winRate(now)! * 10) / 10],
    ["Awaiting THD decision", now.awaiting],
    ["Violations not yet reviewed", now.unreviewed],
    ["Violations with feedback", now.withFeedback],
  ]);

  const months = byMonth(data.lines, data.frame.months);
  sheet(wb, "By month", `By month · ${scope}`, [["Month", 12], ["Quarter", 12], ...FIG_COLS], months.map((m) => [m.label, m.quarter, ...figRow(m)]));

  const programs = groupBy(data.lines, programKey, (_k, l) => l.programName);
  sheet(wb, "Programs", `By program · ${scope}`, [["Program", 28], ...FIG_COLS, ["Share %", 10, "pct"]], programs.map((p) => [p.label, ...figRow(p), p.share]));

  const metrics = groupBy(data.lines, metricKey, (_k, l) => `${l.programName} · ${l.metricName}`);
  sheet(wb, "Compliance types", `By compliance type · ${scope}`, [["Program · Metric", 40], ...FIG_COLS, ["Share %", 10, "pct"]], metrics.map((p) => [p.label, ...figRow(p), p.share]));

  const goals = goalPerformance(data.goalSnapshots, data.frame.months, data.programCode);
  sheet(
    wb,
    "Goal performance",
    `Post-dispute % from published scorecards · ${scope}`,
    [["Program", 24], ["Metric", 26], ["Goal %", 9, "pct"], ...goals.months.map((m): [string, number, Kind] => [fiscalLabel(m), 11, "pct"]), ["Met goal", 10]],
    goals.programs.flatMap((p) => p.metrics.map((m) => [p.name, m.name, m.goalPct, ...m.cells.map((c) => (!c ? null : c.pct !== null ? c.pct : c.meets === true ? "Met" : c.meets === false ? "Missed" : null)), m.judged ? `${m.met} of ${m.judged}` : null])),
  );

  const teams = groupBy(data.lines, teamKey, (k) => k);
  sheet(wb, "Teams", `By team responsible · ${scope}`, [["Team", 24], ...FIG_COLS, ["Share %", 10, "pct"], ["With feedback", 13, "int"]], teams.map((t) => [t.label, ...figRow(t), t.share, t.withFeedback]));

  sheet(wb, "Root causes", `Most common root causes · ${scope}`, [["Root cause", 50], ["Teams", 30], ["Violations", 12, "int"], ["Offsets", 14, "money"]], rootCauses(data.lines, 100).map((r) => [r.cause, r.teams.join(", "), r.violations, r.offsets]));

  sheet(
    wb,
    "Disputes",
    `Dispute pipeline · ${scope}`,
    [["Status", 22], ["Disputes", 10, "int"], ["Amount disputed", 16, "money"], ["Recovered", 14, "money"]],
    disputePipeline(data.lines).filter((p) => p.count).map((p) => [DISPUTE_STATUS_LABELS[p.status], p.count, p.disputed, p.recovered]),
  );

  const ins = issueInsights(data.issues, data.frame.months, fiscalMonthOf);
  const issuesInFrame = data.issues.filter((i) => data.frame.months.includes(fiscalMonthOf(i.issueDate))).sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime());
  sheet(
    wb,
    "Issues",
    `Issues logged · ${scope} · ${ins.total} issue(s), ${ins.open} open`,
    [["Issue", 10], ["Date", 12], ["Title", 40], ["Status", 12], ["Severity", 10], ["Category", 22], ["Team", 20], ["POs", 6, "int"], ["Violations on POs", 10, "int"], ["Offsets on POs", 14, "money"], ["Follow-up", 12], ["Resolved", 12]],
    issuesInFrame.map((i) => [
      issueLabel(i.number),
      formatUtcDate(i.issueDate),
      i.title,
      ISSUE_STATUSES[i.status].label,
      ISSUE_SEVERITIES[i.severity],
      i.category,
      i.team,
      i.poCount,
      i.violations,
      i.offsets,
      i.followUpDate ? formatUtcDate(i.followUpDate) : null,
      i.resolvedAt ? formatUtcDate(i.resolvedAt) : null,
    ]),
  );

  const loc = (key: (l: (typeof data.lines)[number]) => string | null, label: string, name: string, title: string) =>
    sheet(wb, name, `${title} · ${scope}`, [[label, 34], ...FIG_COLS, ["Share %", 10, "pct"]], groupBy(data.lines, key).map((g) => [g.label, ...figRow(g), g.share]));
  loc((l) => l.dcNumber?.trim() || null, "THD location", "Locations", "By THD location");
  loc((l) => l.carrier?.toUpperCase() ?? null, "Carrier", "Carriers", "By carrier");
  sheet(
    wb,
    "SKUs",
    `By SKU · ${scope}`,
    [["SKU", 16], ["Description", 40], ...FIG_COLS],
    groupBy(data.lines, (l) => l.sku?.trim() || null)
      .filter((g) => g.key)
      .map((g) => [g.key, data.lines.find((l) => isViolation(l) && l.sku?.trim() === g.key)?.skuDescription ?? null, ...figRow(g)]),
  );
  sheet(wb, "Repeat POs", `POs with more than one violation · ${scope}`, [["PO #", 14], ["Compliance types", 40], ["Months", 30], ["Violations", 12, "int"], ["Offsets", 14, "money"]], repeatPos(data.lines, 500).map((r) => [r.poNumber, r.metrics.join(", "), r.months.join(", "), r.violations, r.offsets]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
