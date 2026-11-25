import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { ORDER_CANCELLATION, poNumberVariants } from "@/lib/issues";
import { getTimeZone } from "@/lib/time-zone-server";
import { carrierUrl, upsTrackingUrl, type CarrierLinkInfo } from "@/lib/logistics/refs";
import type { Prisma } from "@prisma/client";
import { FLAGS, UPS_SCAC, buildLogistics, type FlagCode, type PomPo, type PoView, asnState } from "@/lib/logistics/views";

// Loads the logistics rows and builds the views (views.ts) once per request. Volumes are small
// (a supplier's last few months of POs), so the views are built in memory.

/** Today's date (YYYY-MM-DD) in the viewer's time zone */
export async function todayFor(): Promise<string> {
  return new Intl.DateTimeFormat("en-CA", { timeZone: await getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const loadLogistics = cache(async () => {
  const [cartons, shipments, pos, parcels, carriers, today, imports, noteCounts, warehouses, channels, asn, pomRows] = await Promise.all([
    prisma.wmsCarton.findMany({
      orderBy: { lineKey: "asc" },
      select: { lineKey: true, label: true, poNumber: true, orderNum: true, orderNumber: true, customer: true, trackingNumber: true, secondTrack: true, product: true, quantity: true, shippedAt: true, shipTo: true, shipName: true, shipAddress1: true, shipAddress2: true, shipAddress3: true, shipCity: true, shipState: true, shipZip: true },
    }),
    prisma.tmsShipment.findMany({
      select: {
        shipmentNumber: true,
        status: true,
        scac: true,
        pickupAt: true,
        pickupLocal: true,
        deliveryAt: true,
        deliveryLocal: true,
        originFacility: true,
        originCity: true,
        originState: true,
        destFacility: true,
        destCity: true,
        destState: true,
        poNumbers: true,
        appointment: true,
        tmsFlags: true,
      },
    }),
    prisma.tmsPurchaseOrder.findMany({
      select: { poNumber: true, status: true, originFacility: true, originCity: true, originState: true, destFacility: true, destCity: true, destState: true, appointment: true, tmsFlags: true },
    }),
    prisma.parcelTracking.findMany({
      select: { trackingNumber: true, status: true, statusType: true, delivered: true, deliveredAt: true, expectedAt: true, lastActivity: true, lastLocation: true, activityAt: true, checkedAt: true, error: true },
    }),
    prisma.carrierLink.findMany({ orderBy: { scac: "asc" } }),
    todayFor(),
    // The latest import of each source, to show how fresh the data is
    Promise.all(
      (["WMS", "TMS_SHIPMENTS", "TMS_POS", "POM", "ASN"] as const).map((source) =>
        prisma.logisticsImport.findFirst({ where: { source }, orderBy: { importedAt: "desc" }, select: { source: true, importedAt: true, fileName: true, rows: true, fetched: true } }),
      ),
    ),
    prisma.logisticsNote.groupBy({ by: ["poNumber", "shipmentNumber"], _count: { _all: true } }),
    // Admin › Settings › Warehouses: which warehouse shipped, from the WMS OrderNumber prefix
    prisma.warehouse.findMany({ orderBy: [{ sortOrder: "asc" }, { prefix: "asc" }], select: { prefix: true, name: true } }),
    // Admin › Settings › Channels: which channel, from the WMS CUST_NUM
    prisma.channel.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }], select: { code: true, name: true } }),
    // POs confirmed in POM (the ASN/Shipped Confirmation import)
    prisma.asnConfirmation.findMany({ select: { poNumber: true, status: true, confirmedAt: true } }),
    // THD's POM PO search export: PO status (Shipped = ASN received), ESD, destination and SKU lines
    prisma.pomPurchaseOrder.findMany({ include: { lines: true } }),
  ]);
  // Shipment POs not in the WMS or TMS PO data: ours only if THD's compliance data or the Issue Log has them
  const seen = new Set([...pos.map((p) => p.poNumber), ...cartons.map((c) => c.poNumber)]);
  const unknown = [...new Set(shipments.flatMap((s) => s.poNumbers))].filter((po) => !seen.has(po));
  const variants = [...new Set(unknown.flatMap(poNumberVariants))];
  const knownPos = variants.length
    ? [
        ...(await prisma.poRecord.findMany({ where: { poNumber: { in: variants } }, select: { poNumber: true } })).map((r) => r.poNumber),
        ...(await prisma.issuePo.findMany({ where: { poNumber: { in: variants } }, select: { poNumber: true } })).map((r) => r.poNumber),
      ]
    : [];
  // PO create dates live only in THD's compliance data (PO records): the latest use of each number
  const ourNumbers = [...new Set([...pos.map((p) => p.poNumber), ...cartons.map((c) => c.poNumber), ...knownPos])];
  const records = ourNumbers.length
    ? await prisma.poRecord.findMany({ where: { poNumber: { in: [...new Set(ourNumbers.flatMap(poNumberVariants))] }, poCreateDate: { not: null } }, select: { poNumber: true, poCreateDate: true }, orderBy: { poCreateDate: "asc" } })
    : [];
  const poCreated = Object.fromEntries(records.map((r) => [r.poNumber.replace(/^0+(?=\d)/, ""), r.poCreateDate!.toISOString().slice(0, 10)]));
  // TMS sometimes keeps a canceled PO open: a resolved "Order cancellation" issue marks it canceled
  const cancellations = await prisma.issuePo.findMany({
    where: { issue: { category: ORDER_CANCELLATION, status: "RESOLVED" } },
    select: { poNumber: true, poCreateDate: true, issue: { select: { number: true, issueDate: true } } },
  });
  const canceledByIssue = cancellations.map((c) => ({
    poNumber: c.poNumber,
    issueNumber: c.issue.number,
    issueDate: c.issue.issueDate.toISOString().slice(0, 10),
    poCreateDate: c.poCreateDate ? c.poCreateDate.toISOString().slice(0, 10) : null,
  }));
  const views = buildLogistics({ cartons, shipments, pos, parcels, knownPos, poCreated, canceledByIssue, warehouses, channels, asn, pom: pomRows.map(toPomPo) }, today);
  const carrierBy = new Map<string, CarrierLinkInfo>(carriers.map((c) => [c.scac, c]));
  const notes = {
    po: new Map(noteCounts.filter((n) => n.poNumber).map((n) => [n.poNumber!, n._count._all])),
    shipment: new Map(noteCounts.filter((n) => n.shipmentNumber).map((n) => [n.shipmentNumber!, n._count._all])),
  };
  return { ...views, today, warehouses, channels, carriers, carrierBy, latestImports: imports.filter((i) => i !== null), notes, empty: !cartons.length && !shipments.length && !pos.length };
});

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const num = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

/** A stored POM PO for the views */
export function toPomPo(p: Prisma.PomPurchaseOrderGetPayload<{ include: { lines: true } }>): PomPo {
  return {
    poNumber: p.poNumber,
    status: p.status,
    poCreateDate: ymd(p.poCreateDate),
    esd: ymd(p.esd),
    dcDueDate: ymd(p.dcDueDate),
    destinationDc: p.destinationDc,
    crossDock: p.crossDock,
    finalRecvLocation: p.finalRecvLocation,
    buyer: p.buyer,
    reasonCode: p.reasonCode,
    totalQty: p.totalQty,
    totalCost: num(p.totalCost),
    updatedAt: p.updatedAt,
    lines: p.lines.map((l) => ({
      thdSku: l.thdSku,
      description: l.description,
      partNumber: l.partNumber,
      status: l.status,
      orderQty: l.orderQty,
      adjOrderQty: l.adjOrderQty,
      shippedQty: l.shippedQty,
      receivedQty: l.receivedQty,
      unitCost: num(l.unitCost),
    })),
  };
}

export type LoadedLogistics = Awaited<ReturnType<typeof loadLogistics>>;

/** The link for a shipment's SCAC; UPS opens the tracking of a UPS number when there is one */
export function scacLink(l: Pick<LoadedLogistics, "carrierBy">, scac: string, refs: { pro?: string | null; shipment?: string | null; po?: string | null; ups?: string | null }) {
  if (scac === UPS_SCAC && refs.ups) return { url: upsTrackingUrl(refs.ups), known: true };
  return carrierUrl(scac, l.carrierBy.get(scac), refs);
}

/** A short logistics summary of a PO, for the Issue Log and scorecards */
export interface PoLogistics {
  poNumber: string;
  status: PoView["status"];
  shipped: string | null;
  shipments: { number: string; status: string; scac: string | null; url: string | null; delivery: string | null }[];
  ups: string[];
  /** ASN/ship status from the ASN/Shipped Confirmation import: received (confirmed in POM), missing (shipped in the WMS, not confirmed) or null */
  asn: { status: "received" | "missing"; confirmedAt: Date | null } | null;
  flags: { label: string; severity: string; message: string }[];
}

/**
 * Logistics for PO numbers as typed elsewhere (with or without leading zeros), keyed by the
 * number given. POs the logistics data doesn't have are left out.
 */
export async function logisticsForPos(numbers: string[]): Promise<Map<string, PoLogistics>> {
  const out = new Map<string, PoLogistics>();
  if (!numbers.length) return out;
  const l = await loadLogistics();
  if (l.empty) return out;
  const byNumber = new Map(l.pos.map((p) => [p.poNumber, p]));
  for (const n of new Set(numbers)) {
    const p = poNumberVariants(n.trim().toUpperCase())
      .map((v) => byNumber.get(v))
      .find(Boolean);
    if (!p) continue;
    out.set(n, summarize(l, p));
  }
  return out;
}

export function summarize(l: Pick<LoadedLogistics, "carrierBy">, p: PoView): PoLogistics {
  return {
    poNumber: p.poNumber,
    status: p.status,
    shipped: p.firstShipped ? p.firstShipped.toISOString().slice(0, 10) : null,
    shipments: p.shipments.map((s) => ({
      number: s.shipmentNumber,
      status: s.status,
      scac: s.scac,
      url: s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: p.poNumber, pro: p.pros[0], ups: p.ups[0] }).url : null,
      delivery: s.deliveryLocal,
    })),
    ups: p.ups,
    asn: asnState(p),
    // Info flags left out, except the one explaining a cancellation from the Issue Log
    flags: p.flags.filter((f) => f.severity !== "info" || f.code === "CANCELED_BY_ISSUE").map((f) => ({ label: flagLabel(f.code), severity: f.severity, message: f.message })),
  };
}

const flagLabel = (code: FlagCode) => FLAGS[code].label;

/** The POs or shipments picked on the POs or Shipments tab, in the order given (unknown ids dropped) */
export function selectItems(l: Pick<LoadedLogistics, "pos" | "shipments">, kind: "po" | "shipment", ids: string[]) {
  if (kind === "po") {
    const by = new Map(l.pos.map((p) => [p.poNumber, p]));
    return { pos: ids.map((id) => by.get(id)).filter((p): p is PoView => Boolean(p)), shipments: [] as LoadedLogistics["shipments"] };
  }
  const by = new Map(l.shipments.map((s) => [s.shipmentNumber, s]));
  return { pos: [] as PoView[], shipments: ids.map((id) => by.get(id)).filter((s): s is LoadedLogistics["shipments"][number] => Boolean(s)) };
}
