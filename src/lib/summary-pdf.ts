import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { C, createPdf, money } from "@/lib/summary-pdf-layout";
import { periodsLabel, type Summary } from "@/lib/summarizer";

/** The Summarizer's scorecard summary as a portrait Letter PDF, mirroring the page. */
export function summaryPdf(summary: Summary, links: { origin: string; dashboardPath: string | null }, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const label = periodsLabel(summary);
  const { doc, width, heading, table, statBoxes, finish } = createPdf({ title: `Scorecard Summary - ${label}`, creator: siteName });
  const multi = summary.reports.length > 1;
  const url = (path: string) => `${links.origin}${path}`;

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(`Scorecard Summary: ${label}`);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.muted)
    .text(`${summary.reports.length} published report(s) · generated ${new Date().toISOString().slice(0, 10)}`, { continued: Boolean(links.dashboardPath) });
  if (links.dashboardPath) doc.text(" · ", { continued: true }).fillColor(C.blue).text("Public dashboard", { link: url(links.dashboardPath), underline: true });
  doc.moveDown(0.8);

  statBoxes([
    ["Violations", String(summary.totals.violations), C.text],
    ["Offsets", money(summary.totals.preOffset), C.text],
    ["Recovered in disputes", money(summary.totals.recovered), C.green],
    ["Post-dispute offsets", money(summary.totals.postOffset), summary.totals.postOffset > 0 ? C.red : C.text],
    ["Awaiting THD decision", money(summary.totals.awaiting), summary.totals.awaiting > 0 ? C.amber : C.text],
  ]);

  heading("Scorecards");
  table(
    [
      { header: "Period", width: 2.4 },
      { header: "Violations", width: 1.6, align: "right" },
      { header: "Offsets", width: 2.2, align: "right" },
      { header: "Recovered", width: 2.2, align: "right" },
      { header: "Post-dispute", width: 2.2, align: "right" },
      { header: "Awaiting THD decision", width: 2.4, align: "right" },
      { header: "Scorecard", width: 2.2 },
    ],
    [
      ...summary.reports.map((r) => [
        { text: r.periodLabel, bold: true, color: C.text },
        String(r.violations),
        money(r.preOffset),
        r.recovered ? { text: money(r.recovered), color: C.green } : "—",
        { text: money(r.postOffset), bold: true, color: C.text },
        r.awaitingDisputes ? { text: `${money(r.awaiting)} (${r.awaitingDisputes})`, color: C.amber } : "—",
        { text: "View scorecard", link: url(r.scorecardPath) },
      ]),
      ...(multi
        ? [["Total", String(summary.totals.violations), money(summary.totals.preOffset), money(summary.totals.recovered), money(summary.totals.postOffset), money(summary.totals.awaiting), ""]]
        : []),
    ],
    { boldLast: multi },
  );

  heading("Violations by compliance type");
  if (!summary.groups.length) doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("No violations in the chosen reports.", { width });
  for (const g of summary.groups) {
    heading(`${g.program} · ${g.metric}`, `${g.violations} violation(s) · ${money(g.offset)}${g.awaitingDisputes ? ` · ${money(g.awaiting)} awaiting THD decision` : ""}`);
    table(
      [
        ...(multi ? [{ header: "Period", width: 2 }] : []),
        { header: "PO #", width: 2.4 },
        { header: "Offset", width: 2, align: "right" as const },
        { header: "Team responsible", width: 3.6 },
        { header: "Awaiting THD decision", width: 2.4, align: "right" as const },
      ],
      g.rows.map((r) => [...(multi ? [r.periodLabel] : []), { text: r.poNumber ?? "—", color: C.text }, money(r.offset), r.team, r.awaiting ? { text: money(r.awaiting), color: C.amber } : "—"]),
    );
  }

  if (summary.teams.length) {
    heading("By team responsible");
    table(
      [{ header: "Team", width: 4 }, { header: "Violations", width: 2, align: "right" }, { header: "Offsets", width: 2, align: "right" }, { header: "Awaiting THD decision", width: 2.4, align: "right" }],
      summary.teams.map((t) => [{ text: t.team, color: C.text }, String(t.violations), { text: money(t.offset), bold: true, color: C.text }, t.awaiting ? { text: money(t.awaiting), color: C.amber } : "—"]),
    );
  }

  return finish(`${siteName} · Scorecard Summary ${label}`);
}
