import PDFDocument from "pdfkit";
import type { ScorecardData } from "@/lib/scorecard";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { formatDateRange, SHIPMENT_RANGES } from "@/lib/shipment-ranges";

// Standard PDF fonts only cover WinAnsi, so text avoids symbols such as ≥ and →.
// Colours from the Sympl design system (gray-900/700/500/200/50, blue-600, red-700, green-700, amber-700)
const C = { text: "#111827", body: "#374151", muted: "#6B7280", border: "#E5E7EB", head: "#F9FAFB", blue: "#2563EB", red: "#B91C1C", green: "#15803D", amber: "#B45309" };
const MARGIN = 36;

const money = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}%`);

interface Column {
  header: string;
  width: number;
  align?: "left" | "right";
}
type Cell = string | { text: string; color?: string; bold?: boolean };

/** Scorecard as a landscape Letter PDF, mirroring the on-screen scorecard. */
export function scorecardPdf(data: ScorecardData, status: { version: number; publishedAt: string | null }, siteName = DEFAULT_SITE_NAME): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: MARGIN, bufferPages: true, info: { Title: `THD Compliance Scorecard - ${data.periodLabel}`, Creator: siteName } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - 18;

  function ensure(height: number) {
    if (doc.y + height > bottom()) doc.addPage();
  }

  function heading(text: string, aside?: string) {
    ensure(60);
    doc.moveDown(0.8);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(C.text).text(text, MARGIN, y);
    if (aside) doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(aside, MARGIN, y + 2, { width, align: "right" });
    doc.moveDown(0.4);
  }

  function table(columns: Column[], rows: Cell[][], opts: { boldLast?: boolean } = {}) {
    const scale = width / columns.reduce((s, c) => s + c.width, 0);
    const cols = columns.map((c) => ({ ...c, width: c.width * scale }));
    const pad = 5;
    const drawRow = (cells: Cell[], header: boolean, bold: boolean) => {
      doc.fontSize(header ? 7.5 : 8.5);
      const heights = cells.map((cell, i) => {
        const text = typeof cell === "string" ? cell : cell.text;
        doc.font(header || bold || (typeof cell !== "string" && cell.bold) ? "Helvetica-Bold" : "Helvetica");
        return doc.heightOfString(text, { width: cols[i].width - pad * 2 });
      });
      const h = Math.max(...heights) + pad * 2;
      if (doc.y + h > bottom()) {
        doc.addPage();
        if (!header) drawRow(columns.map((c) => c.header.toUpperCase()), true, false);
      }
      const y = doc.y;
      if (header) doc.rect(MARGIN, y, width, h).fill(C.head);
      let x = MARGIN;
      cells.forEach((cell, i) => {
        const text = typeof cell === "string" ? cell : cell.text;
        const color = header ? C.muted : typeof cell === "string" ? C.body : (cell.color ?? C.body);
        doc
          .font(header || bold || (typeof cell !== "string" && cell.bold) ? "Helvetica-Bold" : "Helvetica")
          .fillColor(color)
          .text(text, x + pad, y + pad, { width: cols[i].width - pad * 2, align: cols[i].align ?? "left" });
        x += cols[i].width;
      });
      doc.moveTo(MARGIN, y + h).lineTo(MARGIN + width, y + h).lineWidth(0.5).strokeColor(C.border).stroke();
      doc.y = y + h;
      doc.x = MARGIN;
    };
    drawRow(columns.map((c) => c.header.toUpperCase()), true, false);
    rows.forEach((r, i) => drawRow(r, false, Boolean(opts.boldLast && i === rows.length - 1)));
  }

  // Title
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(`THD Compliance Scorecard: ${data.periodLabel}`);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(C.muted)
    .text(
      [
        data.periodBasis === "RECEIVED_MONTH" ? `Data received in ${data.periodLabel}` : `THD fiscal month ${data.fiscalMonth}`,
        data.dataReceivedAt ? `SPM data received ${data.dataReceivedAt.slice(0, 10)}` : null,
        `generated ${data.generatedAt.slice(0, 10)}`,
        status.publishedAt ? `published ${status.publishedAt.slice(0, 10)} (v${status.version})` : `draft v${status.version}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  doc.moveDown(0.8);

  // Totals
  const boxes: [string, string, string][] = [
    ["Pre-dispute offsets", money(data.totals.preOffset), C.text],
    ["Recovered in disputes", money(data.totals.recovered), C.green],
    ["Post-dispute offsets", money(data.totals.postOffset), data.totals.postOffset > 0 ? C.red : C.text],
    [`Pending (${data.totals.pendingDisputes} disputes)`, money(data.totals.pendingAmount), data.totals.pendingAmount > 0 ? C.amber : C.text],
    ["Violations", String(data.totals.violations), C.text],
  ];
  const gap = 8;
  const boxW = (width - gap * (boxes.length - 1)) / boxes.length;
  const top = doc.y;
  boxes.forEach(([label, value, color], i) => {
    const x = MARGIN + i * (boxW + gap);
    doc.roundedRect(x, top, boxW, 44, 4).lineWidth(0.75).strokeColor(C.border).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text(label, x + 8, top + 8, { width: boxW - 16 });
    doc.font("Helvetica-Bold").fontSize(14).fillColor(color).text(value, x + 8, top + 21, { width: boxW - 16 });
  });
  doc.y = top + 52;
  doc.x = MARGIN;
  if (data.historical) {
    doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text("Historical: built from the archived SPM exports. Violations were accepted as THD reported them; post-dispute amounts marked * come from THD's own summary.");
  }
  if (data.totals.pendingDisputes > 0) {
    doc.font("Helvetica").fontSize(8.5).fillColor(C.amber).text(`${data.totals.pendingDisputes} dispute(s) await THD's decision; post-dispute figures assume they are not approved.`);
  }

  // Shipments
  if (data.shipments?.programs.length) {
    const sh = data.shipments;
    heading("Shipments", sh.transportationLtl !== null ? `${sh.transportationLtl} RDC + DFC LTL shipments (Transportation)` : undefined);
    if (sh.ranges) {
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(C.body)
        .text(SHIPMENT_RANGES.map(({ key, label }) => `${label}: ${formatDateRange(sh.ranges![key])}`).join("     "));
      doc.moveDown(0.4);
    }
    const n = (v: number | null) => (v === null ? { text: "Not entered", color: C.muted } : v.toLocaleString("en-US"));
    table(
      [{ header: "Mode", width: 3 }, ...sh.programs.map((p) => ({ header: p.name, width: 3, align: "right" as const })), { header: "Total", width: 2, align: "right" }],
      [
        ["Small Parcel", ...sh.programs.map((p) => n(p.smallParcel)), sh.totals.smallParcel.toLocaleString("en-US")],
        ["LTL & TL", ...sh.programs.map((p) => n(p.ltl)), sh.totals.ltl.toLocaleString("en-US")],
        ["Total", ...sh.programs.map((p) => n(p.total)), sh.totals.total.toLocaleString("en-US")],
      ],
      { boldLast: true },
    );
  }

  // Programs
  for (const p of data.programs) {
    heading(p.name, `${p.violations} violation(s) · ${money(p.preOffset)} pre-dispute, ${money(p.postOffset)} post-dispute`);
    table(
      [
        { header: "Metric", width: 4 },
        { header: "Goal", width: 1.6 },
        { header: "Pre-dispute", width: 2, align: "right" },
        { header: "Post-dispute", width: 2, align: "right" },
        { header: "Result", width: 2.2 },
        { header: "Violations", width: 2.6 },
        { header: "Pre-dispute $", width: 2.2, align: "right" },
        { header: "Post-dispute $", width: 2.2, align: "right" },
      ],
      p.metrics.map((m) => {
        const meets = m.lines === 0 && m.violations === 0 ? true : m.meetsGoal;
        return [
          { text: m.name, color: C.text },
          m.goalPct == null ? "—" : `>= ${m.goalPct}%`,
          pct(m.prePct),
          pct(m.postPct),
          meets === null ? "—" : meets ? { text: "Meets goal", color: C.green } : { text: "Below goal", color: C.red },
          m.violations ? { text: `${m.violations}${m.disputed ? ` (${m.disputed} disputed, ${m.approved} approved)` : ""}`, color: C.red } : "0",
          m.preOffset ? money(m.preOffset) : "—",
          m.postOffset ? { text: `${money(m.postOffset)}${m.thdPostDispute ? " *" : ""}`, bold: true, color: C.text } : m.thdPostDispute ? "— *" : "—",
        ];
      }),
    );
  }

  // Team influence and trend
  heading("Offsets by team influence");
  table(
    [{ header: "Team", width: 4 }, { header: "Violations", width: 2, align: "right" }, { header: "Offsets", width: 2, align: "right" }],
    data.teamInfluence.length ? data.teamInfluence.map((t) => [t.team, String(t.lines), money(t.amount)]) : [["No violations this period", "", ""]],
  );
  heading("12-month offsets");
  table(
    [{ header: "Month", width: 3 }, { header: "Pre-dispute", width: 3, align: "right" }, { header: "Recovered", width: 3, align: "right" }, { header: "Net", width: 3, align: "right" }],
    data.trend.map((t) => [
      t.fiscalMonth === data.fiscalMonth ? { text: t.label, bold: true, color: C.blue } : t.label,
      t.preOffset ? money(t.preOffset) : "—",
      t.recovered ? { text: money(t.recovered), color: C.green } : "—",
      money(Math.max(0, t.preOffset - t.recovered)),
    ]),
  );

  // Violations
  heading("Violations", `${data.violations.length} line(s)`);
  table(
    [
      { header: "Program · Metric", width: 4.5 },
      { header: "PO #", width: 2.2 },
      { header: "Site", width: 2.4 },
      { header: "Offset", width: 1.8, align: "right" },
      { header: "Team", width: 2 },
      { header: "Dispute", width: 3.2 },
      { header: "Recovered", width: 1.8, align: "right" },
      { header: "Notes", width: 5 },
    ],
    data.violations.length
      ? data.violations.map((v) => [
          `${v.program}\n${v.metric}`,
          v.poNumber ?? "—",
          v.dcNumber ?? "—",
          money(v.offset),
          v.teamInfluence ?? "—",
          v.disputeStatus ? `${DISPUTE_STATUS_LABELS[v.disputeStatus]}${v.reasonCode ? `\n${v.reasonCode}` : ""}` : { text: "Not disputed", color: C.muted },
          v.recovered ? { text: money(v.recovered), color: C.green } : "—",
          v.notes ?? "",
        ])
      : [["No violations this period", "", "", "", "", "", "", ""]],
  );

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN;
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted);
    doc.text(`${siteName} · THD Compliance Scorecard ${data.periodLabel}`, MARGIN, y, { width, align: "left", lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, y, { width, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
