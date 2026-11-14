import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";
import { getTimeZone } from "@/lib/time-zone-server";
import { carrierUrl, type CarrierLinkInfo } from "@/lib/logistics/refs";
import { FLAGS, buildLogistics, type FlagCode, type PoView } from "@/lib/logistics/views";

// Loads the logistics rows and builds the views (views.ts) once per request. Volumes are small
// (a supplier's last few months of POs), so the views are built in memory.

/** Today's date (YYYY-MM-DD) in the viewer's time zone */
export async function todayFor(): Promise<string> {
  return new Intl.DateTimeFormat("en-CA", { timeZone: await getTimeZone(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const loadLogistics = cache(async () => {
  const [cartons, shipments, pos, parcels, carriers, today, imports, noteCounts] = await Promise.all([
    prisma.wmsCarton.findMany({
      orderBy: { lineKey: "asc" },
      select: { lineKey: true, label: true, poNumber: true, orderNum: true, customer: true, trackingNumber: true, secondTrack: true, product: true, quantity: true, shippedAt: true, shipCity: true, shipState: true, shipZip: true },
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
      (["WMS", "TMS_SHIPMENTS", "TMS_POS"] as const).map((source) =>
        prisma.logisticsImport.findFirst({ where: { source }, orderBy: { importedAt: "desc" }, select: { source: true, importedAt: true, fileName: true, rows: true, fetched: true } }),
      ),
    ),
    prisma.logisticsNote.groupBy({ by: ["poNumber", "shipmentNumber"], _count: { _all: true } }),
  ]);
  const views = buildLogistics({ cartons, shipments, pos, parcels }, today);
  const carrierBy = new Map<string, CarrierLinkInfo>(carriers.map((c) => [c.scac, c]));
  const notes = {
    po: new Map(noteCounts.filter((n) => n.poNumber).map((n) => [n.poNumber!, n._count._all])),
    shipment: new Map(noteCounts.filter((n) => n.shipmentNumber).map((n) => [n.shipmentNumber!, n._count._all])),
  };
  return { ...views, today, carriers, carrierBy, latestImports: imports.filter((i) => i !== null), notes, empty: !cartons.length && !shipments.length && !pos.length };
});

export type LoadedLogistics = Awaited<ReturnType<typeof loadLogistics>>;

/** The link for a shipment's SCAC */
export function scacLink(l: Pick<LoadedLogistics, "carrierBy">, scac: string, refs: { pro?: string | null; shipment?: string | null; po?: string | null }) {
  return carrierUrl(scac, l.carrierBy.get(scac), refs);
}

/** A short logistics summary of a PO, for the Issue Log and scorecards */
export interface PoLogistics {
  poNumber: string;
  status: PoView["status"];
  shipped: string | null;
  shipments: { number: string; status: string; scac: string | null; url: string | null; delivery: string | null }[];
  ups: string[];
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
      url: s.scac ? scacLink(l, s.scac, { shipment: s.shipmentNumber, po: p.poNumber, pro: p.pros[0] }).url : null,
      delivery: s.deliveryLocal,
    })),
    ups: p.ups,
    flags: p.flags.filter((f) => f.severity !== "info").map((f) => ({ label: flagLabel(f.code), severity: f.severity, message: f.message })),
  };
}

const flagLabel = (code: FlagCode) => FLAGS[code].label;
