import { DEFAULT_SITE_NAME } from "@/lib/brand";
import { pdfText } from "@/lib/issue-pdf";
import { C, MARGIN, createPdf } from "@/lib/summary-pdf-layout";
import { FLAGS, type Flag, type PoView, type ShipmentView } from "@/lib/logistics/views";
import type { SelectionKind } from "@/lib/logistics/edi";
import { formatDateTime, formatUtcDate } from "@/lib/utils";

// The Logistics report for selected POs or shipments, as a landscape Letter PDF: a summary table,
// then each one with its flags explained. The same report is attached to Send Email emails.

const SEV_COLOR = { high: C.red, medium: C.amber, info: C.muted } as const;
const route = (s: { originCity: string | null; originState: string | null; destFacility: string | null; destCity: string | null; destState: string | null }) =>
  `${[s.originCity, s.originState].filter(Boolean).join(", ") || "?"} to ${[s.destFacility, [s.destCity, s.destState].filter(Boolean).join(", ")].filter(Boolean).join(" ") || "?"}`;

export function logisticsReportFileName(kind: SelectionKind, count: number, today: string) {
  return `Logistics_Report_${count}_${kind === "po" ? "POs" : "Shipments"}_${today}.pdf`;
}

export function logisticsReportPdf(input: { kind: SelectionKind; pos: PoView[]; shipments: ShipmentView[]; by: string; timeZone: string; siteName?: string }): Promise<Buffer> {
  const { kind, pos, shipments, timeZone } = input;
  const siteName = input.siteName ?? DEFAULT_SITE_NAME;
  const count = kind === "po" ? pos.length : shipments.length;
  const title = `Logistics report: ${count} ${kind === "po" ? (count === 1 ? "PO" : "POs") : count === 1 ? "shipment" : "shipments"}`;
  const { doc, width, heading, table, finish } = createPdf({ title, creator: siteName, layout: "landscape" });

  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.text).text(title);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(pdfText(`${siteName} · generated ${formatDateTime(new Date(), timeZone)} by ${input.by}`));

  const flagCell = (flags: Flag[]) => {
    const shown = [...new Map(flags.filter((f) => f.severity !== "info").map((f) => [f.code, f])).values()];
    return shown.length ? { text: pdfText(shown.map((f) => FLAGS[f.code].label).join(", ")), color: shown.some((f) => f.severity === "high") ? C.red : C.amber } : "—";
  };
  const flagList = (flags: Flag[]) => {
    if (!flags.length) {
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text("Nothing flagged.", MARGIN, doc.y, { width });
      return;
    }
    for (const f of flags) {
      if (doc.y + 24 > doc.page.height - MARGIN - 18) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(9).fillColor(SEV_COLOR[f.severity]).text(pdfText(`${FLAGS[f.code].label}: `), MARGIN + 8, doc.y, { width: width - 8, continued: true });
      doc.font("Helvetica").fillColor(C.body).text(pdfText(f.message));
    }
  };

  if (kind === "po") {
    heading("Summary");
    table(
      [
        { header: "PO #", width: 1.5 },
        { header: "Created", width: 1.3 },
        { header: "Status", width: 1.2 },
        { header: "Destination", width: 2.6 },
        { header: "Shipped (WMS)", width: 1.4 },
        { header: "Cartons", width: 1, align: "right" },
        { header: "TMS shipments / tracking", width: 3.2 },
        { header: "Flags", width: 3.2 },
      ],
      pos.map((p) => [
        { text: p.poNumber, bold: true, color: C.text },
        p.createdAt ? formatUtcDate(p.createdAt) : "—",
        p.status,
        pdfText(p.destination),
        p.firstShipped ? formatUtcDate(p.firstShipped) : "—",
        p.cartonCount ? `${p.cartonCount} (${p.units} u)` : "—",
        pdfText(p.shipments.map((s) => `${s.shipmentNumber} ${s.scac ?? ""} ${s.status}`.replace(/\s+/g, " ")).join("\n") || p.ups.join("\n") || "—"),
        flagCell(p.flags),
      ]),
    );
    heading("Details");
    for (const p of pos) {
      if (doc.y + 60 > doc.page.height - MARGIN - 18) doc.addPage();
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text(pdfText(`PO ${p.poNumber} · ${p.status}`), MARGIN, doc.y, { width });
      const wmsIds = p.wmsTms.filter((id) => !p.shipments.some((s) => s.shipmentNumber === id));
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(C.muted)
        .text(
          pdfText(
            [
              `Ship-from ${p.origin}`,
              `to ${p.destination}`,
              p.tms ? `TMS PO ${p.tms.status}` : "not in the TMS PO file",
              p.firstShipped ? `WMS shipped ${formatUtcDate(p.firstShipped)}` : "not shipped by the WMS",
              wmsIds.length ? `WMS TMS ID ${wmsIds.join(", ")}` : null,
              p.ups.length ? `UPS ${p.ups.join(", ")}` : null,
              p.pros.length ? `PRO ${p.pros.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join("  ·  "),
          ),
          MARGIN,
          doc.y,
          { width },
        );
      for (const s of p.shipments)
        doc.font("Helvetica").fontSize(9).fillColor(C.body).text(pdfText(`TMS shipment ${s.shipmentNumber} · ${s.scac ?? "no carrier"} · ${s.status} · pickup ${s.pickupLocal ?? "?"} · delivery ${s.deliveryLocal ?? "?"} · ${route(s)}`), MARGIN + 8, doc.y, { width: width - 8 });
      doc.moveDown(0.2);
      flagList(p.flags);
    }
  } else {
    heading("Summary");
    table(
      [
        { header: "Shipment #", width: 1.5 },
        { header: "SCAC", width: 0.9 },
        { header: "Status", width: 1.2 },
        { header: "Pickup / delivery", width: 2.2 },
        { header: "Route", width: 2.8 },
        { header: "Our POs", width: 2.4 },
        { header: "Cartons", width: 1, align: "right" },
        { header: "Flags", width: 3 },
      ],
      shipments.map((s) => [
        { text: s.shipmentNumber, bold: true, color: C.text },
        s.scac ?? "—",
        s.status,
        pdfText(`${s.pickupLocal ?? "?"}\n${s.deliveryLocal ?? "?"}`),
        pdfText(route(s)),
        s.ourPos.join(", ") || "—",
        s.cartonCount ? String(s.cartonCount) : "—",
        flagCell(s.flags),
      ]),
    );
    heading("Details");
    for (const s of shipments) {
      if (doc.y + 60 > doc.page.height - MARGIN - 18) doc.addPage();
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(C.text).text(pdfText(`Shipment ${s.shipmentNumber} · ${s.scac ?? "no carrier"} · ${s.status}`), MARGIN, doc.y, { width });
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(C.muted)
        .text(
          pdfText(
            [
              `${route(s)}`,
              `pickup ${s.pickupLocal ?? "?"}`,
              `delivery ${s.deliveryLocal ?? "?"}`,
              s.ourPos.length ? `our POs ${s.ourPos.join(", ")}` : null,
              s.otherPos.length ? `${s.otherPos.length} other supplier PO(s)` : null,
              s.appointment ? `stops ${s.appointment}` : null,
            ]
              .filter(Boolean)
              .join("  ·  "),
          ),
          MARGIN,
          doc.y,
          { width },
        );
      doc.moveDown(0.2);
      flagList(s.flags);
    }
  }
  return finish(pdfText(`${siteName} · ${title}`));
}
