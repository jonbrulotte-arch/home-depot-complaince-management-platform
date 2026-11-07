import ExcelJS from "exceljs";
import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { prisma } from "@/lib/prisma";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel, issueWhere, type IssueFilters } from "@/lib/issues";
import { matchIssuePos } from "@/lib/issues-data";
import { teamNames } from "@/lib/teams";
import { formatUtcDate } from "@/lib/utils";

const MONEY = '"$"#,##0.00';
const MAX_ISSUES = 5000;

function sheet(wb: ExcelJS.Workbook, name: string, columns: [string, number][]) {
  const ws = wb.addWorksheet(name);
  columns.forEach(([, w], i) => (ws.getColumn(i + 1).width = w));
  const head = ws.addRow(columns.map(([h]) => h));
  head.font = { bold: true, color: { argb: "FF374151" } };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

/**
 * The issues matching the Issue Log's filters as a workbook: one row per issue, and one per issue PO
 * with what the compliance data holds for it (lines, violations, offsets) once it has been imported.
 */
export async function issuesWorkbook(filters: IssueFilters, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const issues = await prisma.issue.findMany({
    where: issueWhere(filters),
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    take: MAX_ISSUES,
    include: { program: { select: { name: true } }, createdBy: { select: { name: true } }, pos: { orderBy: { poNumber: "asc" } } },
  });

  const teams = await teamNames();
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const ws = sheet(wb, "Issues", [
    ["Issue", 10], ["Date", 12], ["Title", 36], ["Status", 12], ["Severity", 10], ["Category", 22], ["Program", 22], ["Team", 18],
    ["HD Support tickets", 20], ["POs", 30], ["What happened", 50], ["Actions taken", 40], ["Consequences", 40], ["People involved", 30],
    ["References", 26], ["Resolution", 36], ["Follow-up", 12], ["Resolved", 12], ["Estimated max fine", 16], ["Logged by", 18],
  ]);
  for (const i of issues) {
    ws.addRow([
      issueLabel(i.number), formatUtcDate(i.issueDate), i.title, ISSUE_STATUSES[i.status].label, ISSUE_SEVERITIES[i.severity], i.category,
      i.program?.name ?? null, i.team ? (teams[i.team] ?? i.team) : null, i.hdTickets.join(", ") || null, i.pos.map((p) => p.poNumber).join(", "),
      i.description, i.actionsTaken, i.consequences, i.peopleInvolved, i.references, i.resolution,
      i.followUpDate ? formatUtcDate(i.followUpDate) : null, i.resolvedAt ? formatUtcDate(i.resolvedAt) : null, i.estimatedFine, i.createdBy?.name ?? null,
    ]).alignment = { vertical: "top", wrapText: true };
  }

  ws.getColumn(19).numFmt = '"$"#,##0'; // Estimated max fine

  const pos = issues.flatMap((i) => i.pos.map((p) => ({ issue: i, po: p })));
  const records = await matchIssuePos(pos.map(({ issue, po }) => ({ poNumber: po.poNumber, poCreateDate: po.poCreateDate, issueDate: issue.issueDate })));
  const recordIds = [...new Set(records.flatMap((r) => (r ? [r.id] : [])))];
  const totals = recordIds.length
    ? await prisma.complianceLine.groupBy({ by: ["poRecordId", "isCompliant"], where: { poRecordId: { in: recordIds } }, _count: { _all: true }, _sum: { offsetAmount: true } })
    : [];
  const ps = sheet(wb, "Issue POs", [
    ["Issue", 10], ["Date", 12], ["Title", 36], ["PO #", 14], ["PO create date", 14], ["In compliance data", 18], ["Compliance lines", 16], ["Violations", 12], ["Offsets", 12], ["Est. fine", 12],
  ]);
  pos.forEach(({ issue, po }, n) => {
    const record = records[n];
    const rows = record ? totals.filter((t) => t.poRecordId === record.id) : [];
    const lines = rows.reduce((s, t) => s + t._count._all, 0);
    const violations = rows.filter((t) => !t.isCompliant).reduce((s, t) => s + t._count._all, 0);
    const offsets = rows.reduce((s, t) => s + Number(t._sum.offsetAmount ?? 0), 0);
    const createDate = po.poCreateDate ?? record?.poCreateDate ?? null;
    ps.addRow([issueLabel(issue.number), formatUtcDate(issue.issueDate), issue.title, po.poNumber, createDate ? formatUtcDate(createDate) : null, record ? "Yes" : "Not yet", lines, violations, offsets, po.estimatedFine]);
  });
  ps.eachRow((row, n) => {
    if (n === 1) return;
    row.getCell(9).numFmt = MONEY;
    row.getCell(10).numFmt = '"$"#,##0';
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
