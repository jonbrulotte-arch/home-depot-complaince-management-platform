import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";
import { loadLogistics } from "@/lib/logistics/data";
import { cityLine, destinationName, emptySlip, itemsFromCartons, type CatalogEntry, type PackingSlip, type SlipItem } from "@/lib/packing-slip";

// Fills a packing slip for a PO from what the platform has: the WMS lines (products, units, cartons,
// ship-to), the TMS shipment and carrier, the warehouse it shipped from (Admin › Settings ›
// Warehouses), THD's SKUs and descriptions (compliance data), and the destination address book.

export interface WarehouseOption {
  prefix: string;
  name: string;
  shipFromName: string;
  address: string;
}

/** Warehouses as ship-from choices: their slip name (else their name) and address */
export async function slipWarehouses(): Promise<WarehouseOption[]> {
  const rows = await prisma.warehouse.findMany({ orderBy: [{ sortOrder: "asc" }, { prefix: "asc" }], select: { prefix: true, name: true, shipFromName: true, address: true } });
  return rows.map((w) => ({ prefix: w.prefix, name: w.name, shipFromName: w.shipFromName || w.name, address: w.address ?? "" }));
}

/** THD's SKU and latest description for each of our SKUs, from THD's compliance data */
async function thdCatalog(vendorSkus: string[]): Promise<Map<string, CatalogEntry>> {
  if (!vendorSkus.length) return new Map();
  const rows = await prisma.complianceLine.findMany({
    where: { vendorSku: { in: vendorSkus }, sku: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { vendorSku: true, sku: true, skuDescription: true },
  });
  const out = new Map<string, CatalogEntry>();
  for (const r of rows) if (r.vendorSku && !out.has(r.vendorSku)) out.set(r.vendorSku, { thdSku: r.sku, description: r.skuDescription?.trim() || null });
  return out;
}

export interface SlipLookup {
  slip: PackingSlip;
  /** Where the details came from, for the page to say */
  sources: { logistics: boolean; compliance: boolean; addressBook: boolean };
  /** The ship-from warehouse picked, by prefix */
  warehouse: string | null;
}

/** A packing slip for a PO number (with or without leading zeros); null when nothing knows the PO */
export async function lookupSlip(input: string): Promise<SlipLookup | null> {
  const number = input.trim().toUpperCase();
  if (!number) return null;
  const variants = poNumberVariants(number);
  const [l, warehouses, record] = await Promise.all([
    loadLogistics(),
    slipWarehouses(),
    // The latest use of the number in THD's compliance data (THD reuses PO numbers)
    prisma.poRecord.findFirst({
      where: { poNumber: { in: variants } },
      orderBy: [{ poCreateDate: { sort: "desc", nulls: "last" } }, { lastSeenAt: "desc" }],
      select: { poNumber: true, poCreateDate: true, dcNumber: true, lines: { select: { sku: true, vendorSku: true, skuDescription: true, orderedQty: true } } },
    }),
  ]);
  const po = l.pos.find((p) => variants.includes(p.poNumber));
  if (!po && !record) return null;

  const slip = emptySlip();
  slip.poNumber = po?.poNumber ?? record!.poNumber;
  slip.poDate = (po?.createdAt ?? record?.poCreateDate)?.toISOString().slice(0, 10) ?? "";

  let items: SlipItem[] = [];
  let warehouse: string | null = null;
  if (po) {
    slip.shipDate = po.firstShipped ? po.firstShipped.toISOString().slice(0, 10) : "";
    // The TMS shipment it went on; else the TMS ID the WMS has; UPS parcels have none
    const shipment = po.shipments.find((s) => !/^cancel/i.test(s.status)) ?? po.shipments[0];
    slip.shipmentId = shipment?.shipmentNumber ?? po.wmsTms[0] ?? "";
    const scac = shipment?.scac ?? (po.ups.length ? "UPSN" : null);
    const carrier = scac ? l.carrierBy.get(scac)?.name : null;
    slip.carrier = scac ? (carrier && carrier.toUpperCase() !== scac ? `${carrier} (${scac})` : scac) : "";
    slip.cartons = po.cartonCount ? String(po.cartonCount) : "";
    items = itemsFromCartons(po.cartons, await thdCatalog([...new Set(po.cartons.map((c) => c.product).filter((p): p is string => Boolean(p)))]));
    warehouse = po.warehouses[0]?.prefix ?? null;
  }
  // No WMS lines yet: THD's own lines for the PO (ordered quantities)
  if (!items.length && record) {
    const byKey = new Map<string, SlipItem>();
    for (const ln of record.lines) {
      const key = ln.sku ?? ln.vendorSku;
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { thdSku: ln.sku ?? "", vendorSku: ln.vendorSku ?? "", description: ln.skuDescription?.trim() ?? "", units: ln.orderedQty == null ? 0 : Math.round(Number(ln.orderedQty)) });
    }
    items = [...byKey.values()];
  }
  slip.items = items;

  const origin = warehouses.find((w) => w.prefix === warehouse);
  if (origin) {
    slip.originName = origin.shipFromName;
    slip.originAddress = origin.address;
  }

  // Destination: the Store/DC from TMS (else THD's DC number), its saved address, else the WMS ship-to
  const facility = (po?.dest.facility ?? record?.dcNumber ?? "").trim().toUpperCase();
  slip.destFacility = facility;
  const saved = facility ? await prisma.destinationAddress.findUnique({ where: { facility } }) : null;
  if (saved) {
    slip.destName = saved.name;
    slip.destAddress = saved.address;
  } else {
    slip.destName = destinationName(facility || null, po?.channels[0]?.code ?? null);
    const carton = po?.cartons.find((c) => c.shipCity || c.shipZip);
    slip.destAddress = carton ? cityLine(carton.shipCity, carton.shipState, carton.shipZip) : cityLine(po?.dest.city ?? null, po?.dest.state ?? null, null);
  }

  return { slip, sources: { logistics: Boolean(po), compliance: Boolean(record) || items.some((i) => i.thdSku), addressBook: Boolean(saved) }, warehouse };
}

/** Remembers a destination's name and address for the next slip to that Store/DC */
export async function rememberDestination(slip: Pick<PackingSlip, "destFacility" | "destName" | "destAddress">, userId: string): Promise<void> {
  const facility = slip.destFacility.trim().toUpperCase();
  if (!facility || !slip.destName.trim() || !slip.destAddress.trim()) return;
  await prisma.destinationAddress.upsert({
    where: { facility },
    create: { facility, name: slip.destName.trim(), address: slip.destAddress.trim(), updatedById: userId },
    update: { name: slip.destName.trim(), address: slip.destAddress.trim(), updatedById: userId },
  });
}
