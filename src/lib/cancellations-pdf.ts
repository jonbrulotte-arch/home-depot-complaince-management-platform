import { fiscalLabel } from "@/lib/fiscal";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { pdfText } from "@/lib/issue-pdf";
import { C, MARGIN, createPdf, money } from "@/lib/summary-pdf-layout";
import { CANCEL_SOURCE_LABELS, cancelTotals, groupCancellations, type CancelGroup, type CancelRow, programLabel } from "@/lib/cancellations";

// Reports & Insights › Cancellations as a PDF report: the filters, headline figures, charts by month
// and SKU, the breakdowns and the cancellations themselves. Charts are single-series bars in the
// platform's blue on a recessive grid, each with its own scale (never two measures on one axis).

const BAR = C.blue;
const GRID = "#E5E7EB";
const DETAIL_ROWS = 300;

const short = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${Math.round(v / 1_000)}k` : `$${Math.round(v)}`);

/** A "nice" axis maximum: 1, 2 or 5 times a power of ten at or above the largest value */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}

export async function cancellationsPdf(
  rows: CancelRow[],
  context: { timeFrame: string; program: string | null; filters: [string, string][]; all: CancelRow[]; by: string; generated: string },
  siteName: string,
): Promise<Buffer> {
  const { doc, width, heading, table, statBoxes, finish } = createPdf({ title: "Cancellations: financial impact", creator: siteName, layout: "landscape" });
  const t = cancelTotals(rows);
  const everything = cancelTotals(context.all);

  // Title and what the report covers
  doc.font("Helvetica-Bold").fontSize(20).fillColor(C.text).text("Cancellations: financial impact", MARGIN, MARGIN);
  doc.moveDown(0.2);
  const scope = [`Time frame: ${context.timeFrame}`, `Program: ${context.program ?? "All programs"}`, ...context.filters.map(([k, v]) => `${k}: ${v}`)].join("   ·   ");
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(pdfText(scope), { width });
  doc.text(pdfText(`${siteName} · generated ${context.generated} by ${context.by}`), { width });
  doc.moveDown(0.8);

  statBoxes([
    ["Cancellations", `${t.rows.toLocaleString("en-US")} (${t.pos.toLocaleString("en-US")} POs)`, C.text],
    ["Units cancelled", t.units.toLocaleString("en-US"), C.text],
    ["Order value lost", money(t.value), C.text],
    ["THD offsets", money(t.offsets), t.offsets ? C.red : C.text],
    ["Recovered · net", `${money(t.recovered)} · ${money(t.net)}`, t.recovered ? C.green : C.text],
    ["Estimated fines", money(t.estimatedFines), C.text],
  ]);
  if (everything.rows !== t.rows) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(C.amber)
      .text(
        `The time frame and filters leave out ${(everything.rows - t.rows).toLocaleString("en-US")} of ${everything.rows.toLocaleString("en-US")} cancellations: ${money(everything.value - t.value)} of ${money(everything.value)} order value. All cancellations recorded: ${money(everything.value)} order value, ${money(everything.offsets)} THD offsets.`,
        MARGIN,
        doc.y,
        { width },
      );
    doc.moveDown(0.4);
  }
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(C.muted)
    .text(
      "Order value is the cancelled units at POM's unit cost (sales lost); THD offsets are THD's Fill Rate charges for them, less what disputes recovered for the net. Each row counts in its PO's create month from POM.",
      MARGIN,
      doc.y,
      { width },
    );

  // Charts: order value and THD offsets by month (two charts, two scales), and the top SKUs
  const months = groupCancellations(rows, (r) => (r.month ? String(r.month) : null), (k) => (k === "—" ? "No date" : fiscalLabel(Number(k))), "key").filter((g) => g.key !== "—");
  const half = (width - 24) / 2;
  if (doc.y + 204 > doc.page.height - MARGIN - 18) doc.addPage();
  const top = Math.max(doc.y + 14, MARGIN);
  columnChart(doc, MARGIN, top, half, 170, "Order value cancelled by month", months.map((g) => ({ label: g.label, value: g.value })));
  columnChart(doc, MARGIN + half + 24, top, half, 170, "THD offsets by month", months.map((g) => ({ label: g.label, value: g.offsets })));
  doc.y = top + 190;
  doc.x = MARGIN;

  const skus = groupCancellations(rows, (r) => r.ourSku ?? r.thdSku, (k) => {
    const r = rows.find((x) => (x.ourSku ?? x.thdSku) === k);
    return r ? [r.ourSku, r.description].filter(Boolean).join(" · ") : k;
  }).filter((g) => g.key !== "—");
  doc.addPage();
  barChart(doc, MARGIN, MARGIN, width, "Top SKUs by order value cancelled", skus.slice(0, 12).map((g) => ({ label: g.label, value: g.value })));

  // Breakdowns
  const cells = (g: Pick<CancelGroup, "rows" | "units" | "value" | "offsets" | "recovered" | "net" | "estimatedFines">) => [
    g.rows.toLocaleString("en-US"),
    g.units.toLocaleString("en-US"),
    money(g.value),
    money(g.offsets),
    money(g.recovered),
    money(g.net),
    g.estimatedFines ? money(g.estimatedFines) : "—",
  ];
  /** A breakdown table; `total` adds the selection's totals (not for overlapping groups such as sources) */
  const groupTable = (title: string, first: string, gs: CancelGroup[], total = true) => {
    heading(title);
    const body = gs.map((g) => [pdfText(g.label), ...cells(g)]);
    table(
      [
        { header: first, width: 4 },
        { header: "Count", width: 1.1, align: "right" },
        { header: "Units", width: 1, align: "right" },
        { header: "Order value", width: 1.6, align: "right" },
        { header: "THD offsets", width: 1.5, align: "right" },
        { header: "Recovered", width: 1.4, align: "right" },
        { header: "Net offsets", width: 1.5, align: "right" },
        { header: "Est. fines", width: 1.3, align: "right" },
      ],
      gs.length ? (total ? [...body, ["Total", ...cells(t)]] : body) : [["Nothing in this selection", "", "", "", "", "", "", ""]],
      { boldLast: total && gs.length > 0 },
    );
  };
  groupTable("By vendor # and PO reason code (POM)", "Vendor # · reason code", groupCancellations(rows, (r) => (r.vendorNumber || r.reasonCode ? `Vendor ${r.vendorNumber ?? "?"} · reason ${r.reasonCode ?? "?"}` : "Not in POM")));
  groupTable("By program", "Program", groupCancellations(rows, programLabel));
  groupTable("By team responsible", "Team", groupCancellations(rows, (r) => r.team ?? "Not assigned"));
  groupTable("By destination (top 15)", "Store/DC", groupCancellations(rows, (r) => r.destination).slice(0, 15), false);
  groupTable("By root cause (top 15)", "Root cause", groupCancellations(rows, (r) => r.rootCause ?? "Not recorded").slice(0, 15), false);
  groupTable(
    "By source and scope",
    "Source / scope",
    [...groupCancellations(rows, (r) => r.sources.map((s) => CANCEL_SOURCE_LABELS[s])), ...groupCancellations(rows, (r) => (r.wholePo ? "Whole PO cancelled" : "SKU line cancelled"))],
    false,
  );

  // The cancellations, largest impact first
  doc.addPage();
  const detail = [...rows].sort((a, b) => b.value + b.net - (a.value + a.net));
  heading("Cancellations", detail.length > DETAIL_ROWS ? `The ${DETAIL_ROWS} with the largest impact of ${detail.length.toLocaleString("en-US")}; the Excel export has them all` : `${detail.length.toLocaleString("en-US")}, largest impact first`);
  table(
    [
      { header: "Month", width: 1 },
      { header: "PO", width: 1.3 },
      { header: "SKU", width: 3.4 },
      { header: "Store/DC", width: 0.9 },
      { header: "POM", width: 1 },
      { header: "Units", width: 0.8, align: "right" },
      { header: "Order value", width: 1.3, align: "right" },
      { header: "THD offset", width: 1.2, align: "right" },
      { header: "Dispute", width: 1.2 },
      { header: "Team / cause", width: 2.4 },
    ],
    detail.slice(0, DETAIL_ROWS).map((r) => [
      r.month ? fiscalLabel(r.month) : "—",
      r.poNumber,
      pdfText([r.ourSku, r.thdSku ? `THD ${r.thdSku}` : null, r.description].filter(Boolean).join(" · ") || (r.wholePo ? "Whole PO" : "—")),
      r.destination ?? "—",
      pdfText(r.pomStatus ? `${r.pomStatus}${r.wholePo ? " (PO)" : ""}` : "—"),
      r.units ? r.units.toLocaleString("en-US") : "—",
      r.value ? money(r.value) : "—",
      r.offsets ? { text: money(r.offsets), color: C.red } : "—",
      r.disputeStatus ? DISPUTE_STATUS_LABELS[r.disputeStatus] : r.offsets ? "Not disputed" : "—",
      pdfText([r.team, r.rootCause, ...r.issues.map((i) => `ISS-${String(i.number).padStart(4, "0")}`)].filter(Boolean).join(" · ") || "—"),
    ]),
  );
  return finish(pdfText(`Cancellations: financial impact · ${context.timeFrame}`));
}

type Doc = ReturnType<typeof createPdf>["doc"];

/** Vertical bars over months: one series, a light grid, the axis maximum labeled, and a value over the tallest bar and the latest */
function columnChart(doc: Doc, x: number, y: number, w: number, h: number, title: string, data: { label: string; value: number }[]) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text).text(title, x, y, { width: w, lineBreak: false });
  const plotTop = y + 20;
  const plotH = h - 44;
  const axisW = 40;
  const plotX = x + axisW;
  const plotW = w - axisW;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  if (!data.some((d) => d.value > 0)) {
    doc.moveTo(plotX, plotTop + plotH).lineTo(plotX + plotW, plotTop + plotH).lineWidth(0.75).strokeColor("#9CA3AF").stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(data.length ? "None in this selection" : "Nothing in this selection", plotX, plotTop + plotH / 2 - 4, { width: plotW, align: "center" });
    return;
  }
  // Grid: baseline, middle and top, labeled on the left
  for (const f of [0, 0.5, 1]) {
    const gy = plotTop + plotH - plotH * f;
    doc.moveTo(plotX, gy).lineTo(plotX + plotW, gy).lineWidth(f === 0 ? 0.75 : 0.5).strokeColor(f === 0 ? "#9CA3AF" : GRID).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(C.muted).text(short(max * f), x, gy - 3.5, { width: axisW - 6, align: "right", lineBreak: false });
  }
  const slot = plotW / data.length;
  const barW = Math.max(3, Math.min(28, slot - 4));
  const peak = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  data.forEach((d, i) => {
    const bh = max ? (plotH * d.value) / max : 0;
    const bx = plotX + slot * i + (slot - barW) / 2;
    const by = plotTop + plotH - bh;
    if (bh > 0) doc.roundedRect(bx, by, barW, bh, Math.min(2, barW / 2)).fill(BAR);
    if (d.value > 0 && (i === peak || i === data.length - 1)) doc.font("Helvetica-Bold").fontSize(7).fillColor(C.text).text(short(d.value), bx - 14, by - 10, { width: barW + 28, align: "center", lineBreak: false });
    // Month labels: all when they fit, else every other one
    if (data.length <= 12 || i % 2 === 0) doc.font("Helvetica").fontSize(6.5).fillColor(C.muted).text(d.label.replace(" 20", " '"), plotX + slot * i - 4, plotTop + plotH + 4, { width: slot + 8, align: "center", lineBreak: false });
  });
}

/** Horizontal bars, largest first, each labeled with its value at the bar's end */
function barChart(doc: Doc, x: number, y: number, w: number, title: string, data: { label: string; value: number }[]) {
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.text).text(title, x, y, { width: w });
  const labelW = Math.min(300, w * 0.38);
  const plotX = x + labelW + 8;
  const plotW = w - labelW - 8 - 70;
  const rowH = 20;
  const top = y + 24;
  const max = Math.max(0, ...data.map((d) => d.value)) || 1;
  data.forEach((d, i) => {
    const ry = top + i * rowH;
    doc.font("Helvetica").fontSize(8).fillColor(C.body).text(pdfText(d.label), x, ry + 4, { width: labelW, height: rowH - 4, ellipsis: true, lineBreak: false });
    const bw = (plotW * d.value) / max;
    if (bw > 0) doc.roundedRect(plotX, ry + 3, Math.max(bw, 1.5), rowH - 7, 2).fill(BAR);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(C.text).text(money(d.value), plotX + bw + 6, ry + 4, { width: 70, lineBreak: false });
  });
  doc.moveTo(plotX, top - 2).lineTo(plotX, top + data.length * rowH).lineWidth(0.75).strokeColor("#9CA3AF").stroke();
  doc.y = top + data.length * rowH + 10;
  doc.x = x;
}
