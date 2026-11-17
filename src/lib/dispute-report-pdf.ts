import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { pdfText } from "@/lib/issue-pdf";
import { lineItem } from "@/lib/issues";
import { C, MARGIN, createPdf, money } from "@/lib/summary-pdf-layout";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { checklistOf, type LoadedDispute } from "@/lib/dispute-email-data";
import { formatDateTime, formatUtcDate, formatUtcDateTime } from "@/lib/utils";

// The dispute report for selected disputes, as a landscape Letter PDF: a summary table, then each
// dispute with what THD charged, the reason code and its documents, the checklist and the review.
// The same report is attached to the Disputes page's Send Email.

export function disputeReportPdf(input: { reportTitle: string; disputes: LoadedDispute[]; teams: Record<string, string>; by: string; timeZone: string; windowCloses: Date | null; siteName?: string }): Promise<Buffer> {
  const { disputes } = input;
  const siteName = input.siteName ?? DEFAULT_SITE_NAME;
  const title = `Disputes: ${disputes.length} ${disputes.length === 1 ? "PO" : "POs"}`;
  const { doc, width, heading, table, finish } = createPdf({ title, creator: siteName, layout: "landscape" });

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(pdfText(title));
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.muted)
    .text(pdfText(`${input.reportTitle}${input.windowCloses ? ` · SPM dispute window closes ${formatUtcDate(input.windowCloses)}` : ""} · ${siteName} · generated ${formatDateTime(new Date(), input.timeZone)} by ${input.by}`));

  heading("Summary");
  table(
    [
      { header: "PO #", width: 1.5 },
      { header: "Program · Metric", width: 2.6 },
      { header: "Item", width: 1.6 },
      { header: "Disputed", width: 1.2, align: "right" },
      { header: "Reason code", width: 2.4 },
      { header: "Documents", width: 1.4 },
      { header: "Status", width: 1.4 },
      { header: "Due", width: 1.2 },
    ],
    disputes.map((d) => {
      const list = checklistOf(d);
      const done = list.filter((c) => c.done).length;
      return [
        { text: d.line.poNumber ?? "—", bold: true, color: C.text },
        pdfText(`${d.line.metric.program.name}\n${d.line.metric.name}`),
        pdfText(lineItem(d.line).primary),
        money(Number(d.amountDisputed)),
        pdfText(d.reasonCode?.code ?? "Not chosen yet"),
        list.length ? { text: `${done} of ${list.length} done`, color: done === list.length ? C.green : C.amber } : "—",
        DISPUTE_STATUS_LABELS[d.status],
        d.dueDate ? formatUtcDate(d.dueDate) : "—",
      ];
    }),
  );

  heading("Details");
  const line = (label: string, value: string | null | undefined) => {
    if (!value) return;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text).text(pdfText(`${label}: `), MARGIN + 8, doc.y, { width: width - 8, continued: true });
    doc.font("Helvetica").fillColor(C.body).text(pdfText(value));
  };
  for (const d of disputes) {
    if (doc.y + 90 > doc.page.height - MARGIN - 18) doc.addPage();
    doc.moveDown(0.6);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(C.text)
      .text(pdfText(`PO ${d.line.poNumber ?? "—"} · ${d.line.metric.program.name} ${d.line.metric.name} · ${money(Number(d.amountDisputed))} · ${DISPUTE_STATUS_LABELS[d.status]}`), MARGIN, doc.y, { width });
    const item = lineItem(d.line);
    const l = d.line;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(C.muted)
      .text(
        pdfText(
          [
            item.primary !== "—" ? [item.primary, item.secondary].filter(Boolean).join(" · ") : item.secondary,
            l.fillRatePct != null ? `fill rate ${Number(l.fillRatePct)}%` : null,
            l.expectedArrivalDate ? `expected arrival ${formatUtcDate(l.expectedArrivalDate)}` : null,
            l.estShipDate ? `ship by ${formatUtcDate(l.estShipDate)}` : null,
            l.actualShipDate ? `shipped ${formatUtcDateTime(l.actualShipDate)}` : null,
            l.goodsReceiptDate ? `received ${formatUtcDate(l.goodsReceiptDate)}` : null,
            l.cancelDate ? `canceled ${formatUtcDate(l.cancelDate)}` : null,
            l.lateReason ? `THD: ${l.lateReason}` : null,
          ]
            .filter(Boolean)
            .join("  ·  "),
        ),
        MARGIN,
        doc.y,
        { width },
      );
    doc.moveDown(0.2);
    line("Reason code", d.reasonCode ? `${d.reasonCode.code}${d.reasonCode.whenToUse ? ` (${d.reasonCode.whenToUse})` : ""}` : "Not chosen yet");
    line("Required documents", d.reasonCode?.requiredDocs);
    line("Documents must show", d.reasonCode?.docDetails);
    const list = checklistOf(d);
    if (list.length) line("Checklist", list.map((c) => `[${c.done ? "x" : " "}] ${c.label}`).join("   "));
    line("Due", d.dueDate ? formatUtcDate(d.dueDate) : null);
    // Linked resources (OneDrive…): the report goes to internal teams, who can open them
    if (d.links.length) line("Linked documents", d.links.map((k) => `${k.label} (${k.url})`).join("   "));
    line("Comment for SPM", d.supplierComment);
    if (d.line.review) {
      const r = d.line.review;
      line(
        "From the review",
        [r.teamInfluence ? `team ${input.teams[r.teamInfluence] ?? r.teamInfluence}` : null, r.rootCause ? `root cause: ${r.rootCause}` : null, r.notes ? `notes: ${r.notes}` : null].filter(Boolean).join("; ") || null,
      );
    }
    if (d.submittedAt) line("Submitted", `${formatUtcDate(d.submittedAt)}${d.spmReference ? ` (SPM ${d.spmReference})` : ""}`);
    if (d.decidedAt)
      line("THD's decision", [DISPUTE_STATUS_LABELS[d.status], d.decisionCode, d.amountRecovered != null ? `${money(Number(d.amountRecovered))} recovered` : null, d.decisionNotes].filter(Boolean).join(" · "));
  }
  return finish(pdfText(`${siteName} · ${title}`));
}
