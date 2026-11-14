import ExcelJS from "exceljs";
import { FLAGS } from "@/lib/logistics/views";
import type { LoadedLogistics } from "@/lib/logistics/data";
import type { PoView } from "@/lib/logistics/views";
import { formatUtcDateTime } from "@/lib/utils";

// Logistics as a workbook for analysis: POs (with their flags), shipments and WMS cartons.

function sheet(wb: ExcelJS.Workbook, name: string, columns: [string, number][], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map(([header, width]) => ({ header, width }));
  ws.getRow(1).font = { bold: true, color: { argb: "FF374151" } };
  ws.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
  });
  for (const r of rows) ws.addRow(r).alignment = { vertical: "top", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function logisticsWorkbook(l: LoadedLogistics, pos: PoView[], siteName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const poSet = new Set(pos.map((p) => p.poNumber));
  sheet(
    wb,
    "POs",
    [["PO #", 13], ["Status", 11], ["TMS PO status", 12], ["Ship-from", 30], ["Destination", 30], ["First shipped (WMS)", 18], ["Cartons", 9], ["Units", 9], ["TMS shipments", 24], ["Carriers", 12], ["UPS", 22], ["PRO", 16], ["Flags", 30], ["Flag details", 70], ["Notes", 7]],
    pos.map((p) => [
      p.poNumber,
      p.status,
      p.tms?.status ?? null,
      p.origin,
      p.destination,
      p.firstShipped ? formatUtcDateTime(p.firstShipped) : null,
      p.cartonCount,
      p.units,
      p.shipments.map((s) => `${s.shipmentNumber} (${s.status})`).join(", ") || null,
      [...new Set(p.shipments.map((s) => s.scac).filter(Boolean))].join(", ") || null,
      p.ups.join(", ") || null,
      p.pros.join(", ") || null,
      p.flags.map((f) => FLAGS[f.code].label).join(", ") || null,
      p.flags.map((f) => f.message).join("\n") || null,
      l.notes.po.get(p.poNumber) ?? 0,
    ]),
  );
  const shipments = l.shipments.filter((s) => s.poNumbers.some((po) => poSet.has(po)));
  sheet(
    wb,
    "Shipments",
    [["Shipment #", 13], ["Status", 11], ["SCAC", 8], ["Pickup", 20], ["Delivery", 20], ["Origin", 30], ["Destination", 30], ["POs", 30], ["Cartons", 9], ["Units", 9], ["Flags", 30], ["Flag details", 70]],
    shipments.map((s) => [
      s.shipmentNumber,
      s.status,
      s.scac,
      s.pickupLocal,
      s.deliveryLocal,
      [s.originFacility, s.originCity, s.originState].filter(Boolean).join(" · "),
      [s.destFacility, s.destCity, s.destState].filter(Boolean).join(" · "),
      s.poNumbers.join(", "),
      s.cartonCount,
      s.units,
      s.flags.map((f) => FLAGS[f.code].label).join(", ") || null,
      s.flags.map((f) => f.message).join("\n") || null,
    ]),
  );
  sheet(
    wb,
    "WMS cartons",
    [["Label (GS1-128)", 24], ["PO #", 13], ["Order", 16], ["Customer", 14], ["Tracking", 20], ["Second track", 16], ["Product", 10], ["Qty", 7], ["Shipped", 18], ["City", 16], ["State", 7], ["ZIP", 8]],
    pos.flatMap((p) => p.cartons.map((c) => [c.label, c.poNumber, c.orderNum, c.customer, c.trackingNumber, c.secondTrack, c.product, c.quantity, formatUtcDateTime(c.shippedAt), c.shipCity, c.shipState, c.shipZip])),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
