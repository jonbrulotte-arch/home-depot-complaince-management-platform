import ExcelJS from "exceljs";
import { pdfText } from "@/lib/issue-pdf";
import { C, MARGIN, createPdf } from "@/lib/summary-pdf-layout";
import { totalUnits, type PackingSlip } from "@/lib/packing-slip";
import { formatUtcDate } from "@/lib/utils";

// A packing slip as a Letter PDF (to print or attach) and as an Excel sheet.

const dateText = (d: string) => (d ? formatUtcDate(d) : "");

export function packingSlipPdf(slip: PackingSlip, siteName: string): Promise<Buffer> {
  const { doc, width, table, finish } = createPdf({ title: `Packing Slip ${slip.poNumber}`, creator: siteName });
  const t = pdfText;

  // Title, and the PO details on the right
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(26).fillColor(C.text).text("PACKING SLIP", MARGIN, top);
  const facts: [string, string][] = [
    ["PO Number", slip.poNumber],
    ["PO Date", dateText(slip.poDate)],
    ["Ship Date", dateText(slip.shipDate)],
    ["Shipment ID", slip.shipmentId],
    ["Carrier", slip.carrier],
    ["Cartons", slip.cartons],
  ].filter(([, v]) => v) as [string, string][];
  const labelX = MARGIN + width - 250;
  let y = top;
  for (const [label, value] of facts) {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(label.toUpperCase(), labelX, y + 2.5, { width: 80, lineBreak: false });
    doc.font(label === "PO Number" ? "Helvetica-Bold" : "Helvetica").fontSize(label === "PO Number" ? 13 : 10).fillColor(C.text).text(t(value), labelX + 80, y, { width: 170, align: "right", lineBreak: false });
    y += label === "PO Number" ? 18 : 14;
  }
  y = Math.max(y, top + 40) + 8;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(2).strokeColor(C.text).stroke();
  y += 14;

  // Ship from / ship to
  const boxW = (width - 16) / 2;
  const box = (x: number, label: string, name: string, address: string) => {
    const pad = 10;
    doc.font("Helvetica-Bold").fontSize(11);
    const nameH = name ? doc.heightOfString(t(name), { width: boxW - pad * 2 }) : 0;
    doc.font("Helvetica").fontSize(10);
    const addrH = address ? doc.heightOfString(t(address), { width: boxW - pad * 2 }) : 0;
    return { h: pad * 2 + 14 + nameH + 2 + addrH, draw: (h: number) => {
      doc.rect(x, y, boxW, h).lineWidth(0.75).strokeColor(C.border).stroke();
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(label, x + pad, y + pad, { width: boxW - pad * 2 });
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text(t(name || "—"), x + pad, y + pad + 14, { width: boxW - pad * 2 });
      if (address) doc.font("Helvetica").fontSize(10).fillColor(C.body).text(t(address), x + pad, doc.y + 2, { width: boxW - pad * 2 });
    } };
  };
  const from = box(MARGIN, "SHIP FROM", slip.originName, slip.originAddress);
  const to = box(MARGIN + boxW + 16, "SHIP TO", slip.destName, slip.destAddress);
  const h = Math.max(from.h, to.h, 70);
  from.draw(h);
  to.draw(h);
  doc.x = MARGIN;
  doc.y = y + h + 18;

  // Items, with the total
  const rows = slip.items.map((i, n) => [String(n + 1), t(i.thdSku), t(i.vendorSku), t(i.description), { text: i.units.toLocaleString("en-US"), bold: true, color: C.text }]);
  rows.push(["", "", "", { text: "Total units", bold: true, color: C.text }, { text: totalUnits(slip.items).toLocaleString("en-US"), bold: true, color: C.text }]);
  table(
    [
      { header: "#", width: 0.5 },
      { header: "Home Depot SKU #", width: 1.8 },
      { header: "Our SKU", width: 1.2 },
      { header: "Description", width: 5 },
      { header: "Units", width: 1, align: "right" },
    ],
    rows,
  );

  // Notes and receipt
  if (doc.y + 120 > doc.page.height - MARGIN - 18) doc.addPage();
  doc.moveDown(1.5);
  y = doc.y;
  const half = (width - 24) / 2;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text("NOTES / SPECIAL INSTRUCTIONS", MARGIN, y, { width: half });
  doc.rect(MARGIN, y + 12, half, 70).lineWidth(0.75).strokeColor(C.border).stroke();
  if (slip.notes) doc.font("Helvetica").fontSize(9).fillColor(C.body).text(t(slip.notes), MARGIN + 8, y + 20, { width: half - 16, height: 56, ellipsis: true });
  const rx = MARGIN + half + 24;
  for (const [i, label] of ["Received By", "Date Received"].entries()) {
    const ly = y + 34 + i * 34;
    doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(label, rx, ly - 12, { width: half });
    doc.moveTo(rx, ly + 6).lineTo(rx + half, ly + 6).lineWidth(0.75).strokeColor(C.muted).stroke();
  }
  return finish(t(`Packing slip · PO ${slip.poNumber}`));
}

/** The slip as one Excel sheet: the details, then the items */
export async function packingSlipXlsx(slip: PackingSlip, siteName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const ws = wb.addWorksheet("Packing Slip");
  ws.columns = [{ width: 8 }, { width: 20 }, { width: 14 }, { width: 50 }, { width: 10 }];
  ws.addRow(["PACKING SLIP"]).font = { bold: true, size: 16 };
  const details: [string, string][] = [
    ["PO Number", slip.poNumber],
    ["PO Date", slip.poDate],
    ["Ship Date", slip.shipDate],
    ["Shipment ID", slip.shipmentId],
    ["Carrier", slip.carrier],
    ["Cartons", slip.cartons],
    ["Ship From", [slip.originName, slip.originAddress].filter(Boolean).join("\n")],
    ["Ship To", [slip.destName, slip.destAddress].filter(Boolean).join("\n")],
    ["Notes", slip.notes],
  ];
  for (const [k, v] of details) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true };
    ws.mergeCells(r.number, 2, r.number, 5);
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    if (v.includes("\n")) r.height = 15 * (v.split("\n").length);
  }
  ws.addRow([]);
  const head = ws.addRow(["#", "Home Depot SKU #", "Our SKU", "Description", "Units"]);
  head.font = { bold: true };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } }));
  slip.items.forEach((i, n) => ws.addRow([n + 1, i.thdSku, i.vendorSku, i.description, i.units]));
  const total = ws.addRow(["", "", "", "Total units", totalUnits(slip.items)]);
  total.font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
