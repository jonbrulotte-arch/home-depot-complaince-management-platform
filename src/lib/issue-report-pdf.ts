import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { pdfText } from "@/lib/issue-pdf";
import type { IssueReport } from "@/lib/issue-report";
import { C, MARGIN, createPdf, money } from "@/lib/summary-pdf-layout";
import { formatDateTime, formatUtcDate } from "@/lib/utils";

// The Summarizer's Issues report as a portrait Letter PDF, mirroring the page. Uses the Summarizer
// PDF's layout helpers; typed text goes through pdfText for the standard fonts.

const dollars = (n: number) => money(n).replace(/\.00$/, "");

export function issueReportPdf(report: IssueReport, opts: { timeZone: string; siteName?: string }): Promise<Buffer> {
  const siteName = opts.siteName ?? DEFAULT_SITE_NAME;
  const tz = opts.timeZone;
  const t = report.totals;
  const title = `Issues Report: ${report.range.label}`;
  const { doc, width, heading, table, statBoxes, finish } = createPdf({ title: pdfText(title), creator: siteName });
  const muted = (text: string) => doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(pdfText(text), MARGIN, doc.y, { width });
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - MARGIN - 18) doc.addPage();
  };

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(pdfText(title));
  muted(`Issues dated in the period, the compliance data on their POs so far, and ${t.updates} update(s) made during it · generated ${formatDateTime(new Date(), tz)}`);
  doc.moveDown(0.8);

  statBoxes([
    ["Issues logged", `${t.issues} (${t.open} open)`, C.text],
    ["Resolved in the period", String(t.resolvedInRange), t.resolvedInRange ? C.green : C.text],
    ["POs found / listed", `${t.posFound} / ${t.pos}`, C.text],
    ["Violations on their POs", String(t.violations), C.text],
  ]);
  statBoxes([
    ["Assessed offsets", money(t.offsets), t.offsets ? C.red : C.text],
    ["Recovered in disputes", money(t.recovered), t.recovered ? C.green : C.text],
    ["Estimated maximum fines", dollars(t.estimated.expected), C.text],
    ["Assessed on estimated issues", money(t.estimated.assessed), C.text],
  ]);
  if (t.estimated.issues)
    muted(
      `Expected vs. assessed: the ${t.estimated.issues} issue(s) with an estimate were expected to cost up to ${dollars(t.estimated.expected)}; THD has assessed ${money(t.estimated.assessed)} on their POs so far. THD's data runs a month or two behind, so recent issues may not be charged yet.`,
    );

  if (!report.issues.length) {
    heading("Issues");
    muted("No issues are dated in this period.");
  } else {
    const breakdown = (name: string, column: string, rows: { label: string; count: number; open: number; offsets: number }[]) => {
      heading(name);
      table(
        [{ header: column, width: 4 }, { header: "Issues", width: 1.2, align: "right" }, { header: "Open", width: 1.2, align: "right" }, { header: "Assessed", width: 1.8, align: "right" }],
        rows.map((r) => [{ text: pdfText(r.label), color: C.text }, String(r.count), r.open ? String(r.open) : "—", r.offsets ? money(r.offsets) : "—"]),
      );
    };
    breakdown("By category", "Category", report.byCategory);
    breakdown("By team responsible", "Team", report.byTeam);
    breakdown("By severity", "Severity", report.bySeverity.map((r) => ({ ...r, label: ISSUE_SEVERITIES[r.label as keyof typeof ISSUE_SEVERITIES] ?? r.label })));
    breakdown("By status (now)", "Status", report.byStatus.map((r) => ({ ...r, label: ISSUE_STATUSES[r.label as keyof typeof ISSUE_STATUSES]?.label ?? r.label })));

    heading("Issues", "newest first");
    table(
      [
        { header: "Issue", width: 1.5 },
        { header: "Date", width: 1.6 },
        { header: "Title", width: 4.2 },
        { header: "Status", width: 1.6 },
        { header: "Team", width: 2 },
        { header: "POs", width: 1.1, align: "right" },
        { header: "Est. fine", width: 1.5, align: "right" },
        { header: "Assessed", width: 1.7, align: "right" },
      ],
      [
        ...report.issues.map((i) => [
          { text: issueLabel(i.number), bold: true, color: C.text },
          formatUtcDate(i.issueDate),
          { text: pdfText(`${i.title}\n${i.category} · ${ISSUE_SEVERITIES[i.severity]}`), color: C.text },
          ISSUE_STATUSES[i.status].label,
          pdfText(i.team ?? "—"),
          i.pos.length ? `${i.posFound}/${i.pos.length}` : "—",
          i.estimatedFine === null ? "—" : dollars(i.estimatedFine),
          i.offsets ? money(i.offsets) : "—",
        ]),
        ["Total", "", "", "", "", `${t.posFound}/${t.pos}`, dollars(t.estimated.expected), money(t.offsets)],
      ],
      { boldLast: true },
    );

    heading("Issue details");
    for (const i of report.issues) detail(i, []);
  }

  if (report.earlier.length) {
    heading("Earlier issues with activity in the period");
    muted("Issues dated before the period that were logged, updated or resolved during it.");
    for (const i of report.earlier) detail(i, [i.loggedInRange && "logged in the period", i.resolvedInRange && "resolved in the period"].filter((s): s is string => Boolean(s)));
  }

  function detail(i: IssueReport["issues"][number], activity: string[]) {
    ensure(120);
    doc.moveDown(1);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).lineWidth(0.75).strokeColor(C.border).stroke();
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(C.text).text(pdfText(`${issueLabel(i.number)}: ${i.title}`), MARGIN, doc.y, { width });
    const statusColor = i.status === "OPEN" ? C.red : i.status === "IN_PROGRESS" ? C.amber : C.green;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(statusColor).text(ISSUE_STATUSES[i.status].label, { continued: true });
    doc
      .font("Helvetica")
      .fillColor(C.muted)
      .text(
        pdfText(
          [
            `  ·  ${formatUtcDate(i.issueDate)}`,
            i.category,
            ISSUE_SEVERITIES[i.severity],
            i.team ?? "no team set",
            i.program,
            i.hdTickets.length ? `HD ${i.hdTickets.join(", ")}` : null,
            i.estimatedFine !== null ? `est. fine ${dollars(i.estimatedFine)}` : null,
            i.followUpDate ? `follow up ${formatUtcDate(i.followUpDate)}` : null,
            i.resolvedAt ? `resolved ${formatDateTime(i.resolvedAt, tz)}` : null,
            ...activity,
          ]
            .filter(Boolean)
            .join("  ·  "),
        ),
        { width },
      );
    for (const [name, value] of [
      ["What happened", i.description],
      ["Actions taken", i.actionsTaken],
      ["Consequences", i.consequences],
      ["Resolution", i.resolution],
    ] as const) {
      if (!value) continue;
      ensure(36);
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text).text(name, MARGIN, doc.y, { width });
      doc.font("Helvetica").fontSize(9).fillColor(C.body).text(pdfText(value), MARGIN, doc.y, { width, lineGap: 1.5 });
    }

    const violations = i.pos.flatMap((p) => p.violations.map((v) => ({ po: p.poNumber, ...v })));
    doc.moveDown(0.4);
    if (!i.pos.length) muted("No POs were listed.");
    if (violations.length)
      table(
        [
          { header: "PO #", width: 1.8 },
          { header: "Month", width: 1.4 },
          { header: "Program · Metric", width: 4 },
          { header: "Offset", width: 1.5, align: "right" },
          { header: "Team", width: 2 },
          { header: "Dispute", width: 2.2 },
        ],
        violations.map((v) => [
          { text: v.po, color: C.text },
          v.month,
          pdfText(`${v.program} · ${v.metric}`),
          money(v.offset),
          pdfText(v.team ?? "—"),
          v.disputeStatus
            ? `${DISPUTE_STATUS_LABELS[v.disputeStatus]}${v.recovered > 0 && (v.disputeStatus === "APPROVED" || v.disputeStatus === "PARTIAL") ? `\n${money(v.recovered)} recovered` : ""}`
            : "—",
        ]),
      );
    const clean = i.pos.filter((p) => p.found && !p.violations.length).map((p) => p.poNumber);
    const notFound = i.pos.filter((p) => !p.found).map((p) => p.poNumber);
    if (clean.length) muted(`No violations on: ${clean.join(", ")}.`);
    if (notFound.length) muted(`Not in the compliance data yet: ${notFound.join(", ")}.`);

    if (i.updates.length) {
      ensure(40);
      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text).text("Updates in the period", MARGIN, doc.y, { width });
      for (const u of i.updates) {
        ensure(30);
        const top = doc.y + 2;
        doc.font("Helvetica-Bold").fontSize(8).fillColor(C.text).text(pdfText(u.author ?? "Former user"), MARGIN + 10, top, { width: width - 10, continued: true });
        doc.font("Helvetica").fillColor(C.muted).text(`  ·  ${formatDateTime(u.createdAt, tz)}`);
        doc.font("Helvetica").fontSize(9).fillColor(C.body).text(pdfText(u.body), MARGIN + 10, doc.y + 1, { width: width - 10, lineGap: 1.5 });
        if (doc.y > top) doc.moveTo(MARGIN + 2, top).lineTo(MARGIN + 2, doc.y).lineWidth(1.5).strokeColor(C.border).stroke();
        doc.moveDown(0.3);
      }
    }
    doc.x = MARGIN;
  }

  return finish(pdfText(`${siteName} · Issues Report ${report.range.label}`));
}
