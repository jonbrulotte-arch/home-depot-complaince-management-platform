import PDFDocument from "pdfkit";

// Layout for the Summarizer's PDF, matching the scorecard PDF's look (scorecard-pdf.ts keeps its
// own copy): Sympl colours, section headings, tables that repeat their header on each new page,
// stat boxes and a page footer.
// Standard PDF fonts only cover WinAnsi, so text avoids symbols such as ≥ and →.

// Colours from the Sympl design system (gray-900/700/500/200/50, blue-600, red-700, green-700, amber-700)
export const C = { text: "#111827", body: "#374151", muted: "#6B7280", border: "#E5E7EB", head: "#F9FAFB", blue: "#2563EB", red: "#B91C1C", green: "#15803D", amber: "#B45309" };
export const MARGIN = 36;

export const money = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));

export interface Column {
  header: string;
  width: number;
  align?: "left" | "right";
}
export type Cell = string | { text: string; color?: string; bold?: boolean; link?: string };

export function createPdf(options: { title: string; creator: string; layout?: "portrait" | "landscape" }) {
  const doc = new PDFDocument({ size: "LETTER", layout: options.layout ?? "portrait", margin: MARGIN, bufferPages: true, info: { Title: options.title, Creator: options.creator } });
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
        const link = typeof cell === "string" ? undefined : cell.link;
        const color = header ? C.muted : link ? C.blue : typeof cell === "string" ? C.body : (cell.color ?? C.body);
        doc
          .font(header || bold || (typeof cell !== "string" && cell.bold) ? "Helvetica-Bold" : "Helvetica")
          .fillColor(color)
          .text(text, x + pad, y + pad, { width: cols[i].width - pad * 2, align: cols[i].align ?? "left", ...(link ? { link, underline: true } : {}) });
        x += cols[i].width;
      });
      doc.moveTo(MARGIN, y + h).lineTo(MARGIN + width, y + h).lineWidth(0.5).strokeColor(C.border).stroke();
      doc.y = y + h;
      doc.x = MARGIN;
    };
    drawRow(columns.map((c) => c.header.toUpperCase()), true, false);
    rows.forEach((r, i) => drawRow(r, false, Boolean(opts.boldLast && i === rows.length - 1)));
  }

  /** A row of bordered boxes, each a small label over a large value */
  function statBoxes(boxes: [label: string, value: string, color: string][]) {
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
  }

  /** Writes the footer on every page and finishes the document. */
  function finish(footer: string): Promise<Buffer> {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Writing inside the bottom margin would otherwise start a new page
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGIN;
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted);
      doc.text(footer, MARGIN, y, { width, align: "left", lineBreak: false });
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, y, { width, align: "right", lineBreak: false });
    }
    doc.end();
    return done;
  }

  return { doc, width, heading, table, statBoxes, finish };
}
