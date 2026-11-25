import ExcelJS from "exceljs";
import { formatUtcDate } from "@/lib/utils";
import { ASN_HEADERS, ASN_STATUS_LABELS } from "@/lib/logistics/parse";
import { addressLines } from "@/lib/logistics/ship-to";
import type { PoView } from "@/lib/logistics/views";

// The ASN/Shipped Confirmation export: PO Number and ASN/Ship Status (Unshipped by default, or the
// status already imported), for someone to check each PO in POM (Supplier Hub) and set Shipped, then
// import the file back. The columns after the second are only there to help find the PO.

export async function asnConfirmationWorkbook(pos: PoView[], siteName: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = siteName;
  const ws = wb.addWorksheet("ASN Confirmation", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: ASN_HEADERS.po, key: "po", width: 16 },
    { header: ASN_HEADERS.status, key: "status", width: 18 },
    { header: "Shipped (WMS)", key: "shipped", width: 14 },
    { header: "TMS shipment(s)", key: "shipments", width: 22 },
    { header: "Carrier", key: "scac", width: 10 },
    { header: "Ship-to", key: "shipTo", width: 44 },
    { header: "Warehouse", key: "warehouse", width: 24 },
    { header: "Logistics status", key: "logistics", width: 14 },
    { header: "POM status", key: "pom", width: 12 },
    { header: "ESD (POM)", key: "esd", width: 12 },
  ];
  for (const p of pos)
    ws.addRow({
      po: p.poNumber,
      status: ASN_STATUS_LABELS[p.asn?.status ?? "UNSHIPPED"],
      shipped: p.firstShipped ? formatUtcDate(p.firstShipped) : "",
      shipments: p.shipments.map((s) => s.shipmentNumber).join(", "),
      scac: [...new Set(p.shipments.map((s) => s.scac).filter(Boolean))].join(", "),
      shipTo: p.shipTo ? [p.shipTo.facility ? `#${p.shipTo.facility}` : null, ...addressLines(p.shipTo)].filter(Boolean).join(", ") : p.destination,
      warehouse: p.warehouses.map((w) => w.name).join(", "),
      logistics: p.status,
      pom: p.pom?.status ?? "",
      esd: p.pom?.esd ?? "",
    });
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((c, col) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col <= 2 ? "FFDBEAFE" : "FFF3F4F6" } };
  });
  // PO numbers stay text (leading zeros), and the status is a dropdown
  ws.getColumn(1).numFmt = "@";
  for (let r = 2; r <= pos.length + 1; r++) {
    ws.getCell(r, 1).value = String(ws.getCell(r, 1).value ?? "");
    ws.getCell(r, 2).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${ASN_STATUS_LABELS.UNSHIPPED},${ASN_STATUS_LABELS.SHIPPED}"`],
      showErrorMessage: true,
      errorTitle: "ASN/Ship Status",
      error: `Choose ${ASN_STATUS_LABELS.UNSHIPPED} or ${ASN_STATUS_LABELS.SHIPPED}`,
    };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const asnExportFileName = (today: string) => `ASN_Confirmation_${today}.xlsx`;
