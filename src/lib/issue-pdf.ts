import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { fiscalLabel } from "@/lib/fiscal";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import type { getIssue } from "@/lib/issues-data";
import { TEAM_INFLUENCES } from "@/lib/line-fields";
import { C, MARGIN, createPdf, money } from "@/lib/summary-pdf-layout";
import { formatDateTime, formatUtcDate } from "@/lib/utils";
import { DISPOSITIONS } from "@/components/shared/status-badges";

// An Issue Log issue as a portrait Letter PDF, laid out like its page: the issue, its details, its
// POs tied to compliance data, the updates and the list of files (names only). Shares the
// Summarizer PDF's layout helpers, so it looks like the platform's other PDFs.

type Found = NonNullable<Awaited<ReturnType<typeof getIssue>>>;

// Characters the standard PDF fonts can draw (WinAnsi); anything else in typed text becomes "?"
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[^\n\t\x20-\x7e\xa0-\xff]/g, (c) => (WIN_ANSI_EXTRA.includes(c) ? c : c === "→" ? "->" : c === "≥" ? ">=" : c === "≤" ? "<=" : "?"));
}

export function issuePdf(found: Found, opts: { timeZone: string; siteName?: string }): Promise<Buffer> {
  const { issue, pos } = found;
  const siteName = opts.siteName ?? DEFAULT_SITE_NAME;
  const tz = opts.timeZone;
  const label = issueLabel(issue.number);
  const title = pdfText(`${label}: ${issue.title}`);
  const { doc, width, heading, table, finish } = createPdf({ title, creator: siteName });

  // Title, status and who logged it
  doc.font("Helvetica-Bold").fontSize(17).fillColor(C.text).text(title, { width });
  const status = ISSUE_STATUSES[issue.status].label;
  const statusColor = issue.status === "OPEN" ? C.red : issue.status === "IN_PROGRESS" ? C.amber : C.green;
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor).text(status, { continued: true });
  doc
    .font("Helvetica")
    .fillColor(C.muted)
    .text(
      pdfText(
        `  ·  Logged ${formatDateTime(issue.createdAt, tz)}${issue.createdBy ? ` by ${issue.createdBy.name}` : ""}` +
          (issue.updatedAt.getTime() - issue.createdAt.getTime() > 1000 ? `  ·  updated ${formatDateTime(issue.updatedAt, tz)}${issue.updatedBy ? ` by ${issue.updatedBy.name}` : ""}` : ""),
      ),
    );
  doc.moveDown(0.8);

  // Details, two to a row, in a light box
  const facts: [string, string][] = [
    ["Date of the issue", formatUtcDate(issue.issueDate)],
    ["Category", issue.category],
    ["Severity", ISSUE_SEVERITIES[issue.severity]],
    [issue.hdTickets.length > 1 ? "HD Support tickets" : "HD Support ticket", issue.hdTickets.join(", ") || "—"],
    ["THD program", issue.program?.name ?? "—"],
    ["Team responsible", issue.team ? TEAM_INFLUENCES[issue.team] : "—"],
    ["Follow-up date", issue.followUpDate ? formatUtcDate(issue.followUpDate) : "—"],
    ["Resolved", issue.resolvedAt ? formatDateTime(issue.resolvedAt, tz) : "—"],
  ];
  const rows = Math.ceil(facts.length / 2);
  const rowH = 28;
  const boxTop = doc.y;
  doc.roundedRect(MARGIN, boxTop, width, rows * rowH + 12, 4).fillAndStroke(C.head, C.border);
  const colW = (width - 24) / 2;
  facts.forEach(([k, v], i) => {
    const x = MARGIN + 12 + (i % 2) * colW;
    const y = boxTop + 8 + Math.floor(i / 2) * rowH;
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(k.toUpperCase(), x, y, { width: colW - 12 });
    doc.font("Helvetica").fontSize(9.5).fillColor(C.text).text(pdfText(v), x, y + 10, { width: colW - 12, lineBreak: false, ellipsis: true });
  });
  doc.y = boxTop + rows * rowH + 12;
  doc.x = MARGIN;

  // What happened and the other free-text fields
  const paragraph = (text: string) => doc.font("Helvetica").fontSize(9.5).fillColor(C.body).text(pdfText(text), MARGIN, doc.y, { width, lineGap: 2 });
  heading("What happened");
  paragraph(issue.description);
  const fields: [string, string | null][] = [
    ["Actions taken", issue.actionsTaken],
    ["Consequences", issue.consequences],
    ["People involved", issue.peopleInvolved],
    ["References", issue.references],
    ...(issue.resolution || issue.status === "RESOLVED" || issue.status === "CLOSED" ? [["Resolution", issue.resolution] as [string, string | null]] : []),
  ];
  for (const [name, value] of fields) {
    if (doc.y + 40 > doc.page.height - MARGIN - 18) doc.addPage();
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text).text(name, MARGIN, doc.y, { width });
    doc.moveDown(0.15);
    if (value) paragraph(value);
    else doc.font("Helvetica").fontSize(9.5).fillColor(C.muted).text("Not recorded", MARGIN, doc.y, { width });
  }

  // POs and the compliance data they're tied to
  const linked = pos.filter((p) => p.record);
  const violations = linked.flatMap((p) => p.lines.filter((l) => !l.isCompliant));
  const offsets = violations.reduce((s, l) => s + Number(l.offsetAmount), 0);
  heading(
    "POs and compliance data",
    pos.length ? `${linked.length} of ${pos.length} PO(s) in the compliance data${violations.length ? ` · ${violations.length} violation(s), ${money(offsets)} in offsets` : ""}` : undefined,
  );
  if (!pos.length) {
    doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("No POs were listed for this issue.", { width });
  } else {
    table(
      [
        { header: "PO #", width: 2.3 },
        { header: "Month", width: 1.6 },
        { header: "Program · Metric", width: 3.2 },
        { header: "Result", width: 1.6 },
        { header: "Offset", width: 1.4, align: "right" },
        { header: "Decision", width: 1.8 },
        { header: "Team", width: 1.9 },
        { header: "Dispute", width: 1.9 },
      ],
      pos.flatMap((p) => {
        const created = p.poCreateDate ?? p.record?.poCreateDate;
        const po = { text: `${p.poNumber}${created ? `\nCreated ${formatUtcDate(created)}` : ""}`, color: C.text };
        // The note goes in the wide Program · Metric column (the table has no merged cells)
        if (!p.record || !p.lines.length) return [[po, "", { text: p.record ? "In the PO records, with no compliance lines." : "Not in the compliance data yet.", color: C.muted }, "", "", "", "", ""]];
        return p.lines.map((l, i) => [
          i === 0 ? po : "",
          `${fiscalLabel(l.receivedMonth ?? l.fiscalMonth)}\nFM ${l.fiscalMonth}`,
          `${l.metric.program.name}\n${l.metric.name}`,
          l.isCompliant ? { text: "Compliant", color: C.green } : { text: "Violation", color: C.red, bold: true },
          Number(l.offsetAmount) ? money(Number(l.offsetAmount)) : "—",
          l.isCompliant ? "—" : DISPOSITIONS[l.review?.disposition ?? "PENDING"].label,
          l.review?.teamInfluence ? TEAM_INFLUENCES[l.review.teamInfluence] : "—",
          l.dispute
            ? `${DISPUTE_STATUS_LABELS[l.dispute.status]}${l.dispute.amountRecovered && Number(l.dispute.amountRecovered) > 0 ? `\n${money(Number(l.dispute.amountRecovered))} recovered` : ""}`
            : "—",
        ]);
      }),
    );
  }

  // Updates, oldest first
  heading("Updates");
  if (!issue.notes.length) doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("No updates yet.", { width });
  for (const n of issue.notes) {
    if (doc.y + 40 > doc.page.height - MARGIN - 18) doc.addPage();
    const top = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.text).text(pdfText(n.author?.name ?? "Former user"), MARGIN + 10, top, { width: width - 10, continued: true });
    doc.font("Helvetica").fillColor(C.muted).text(`  ·  ${formatDateTime(n.createdAt, tz)}`);
    doc.font("Helvetica").fontSize(9.5).fillColor(C.body).text(pdfText(n.body), MARGIN + 10, doc.y + 2, { width: width - 10, lineGap: 2 });
    // A rule down the left of the update, like the page's timeline
    if (doc.y > top) doc.moveTo(MARGIN + 2, top).lineTo(MARGIN + 2, doc.y).lineWidth(1.5).strokeColor(C.border).stroke();
    doc.moveDown(0.6);
  }

  // Files: names only, the files themselves stay in the platform
  heading("Files");
  if (!issue.attachments.length) doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("No files attached.", { width });
  else
    table(
      [
        { header: "File", width: 5 },
        { header: "Size", width: 1.2, align: "right" },
        { header: "Added by", width: 2.2 },
        { header: "Added", width: 2.2 },
      ],
      issue.attachments.map((a) => [
        { text: pdfText(a.fileName), color: C.text },
        a.size < 1024 ? "under 1 KB" : `${Math.round(a.size / 1024)} KB`,
        pdfText(a.uploadedBy?.name ?? "—"),
        formatDateTime(a.createdAt, tz),
      ]),
    );

  return finish(pdfText(`${siteName} · ${label} · generated ${formatDateTime(new Date(), tz)}`));
}
