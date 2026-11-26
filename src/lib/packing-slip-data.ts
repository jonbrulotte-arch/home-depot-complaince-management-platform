import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";
import { loadLogistics } from "@/lib/logistics/data";
import { addressLines, facilityKey, genericName, shipToOf } from "@/lib/logistics/ship-to";
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
  sources: { logistics: boolean; compliance: boolean; pom: boolean; addressBook: boolean };
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
    // THD's SKU and description: the PO's own POM lines first, else THD's compliance data
    const catalog = await thdCatalog([...new Set(po.cartons.map((c) => c.product).filter((p): p is string => Boolean(p)))]);
    for (const l of po.pom?.lines ?? []) if (l.partNumber && l.thdSku) catalog.set(l.partNumber.trim(), { thdSku: l.thdSku, description: l.description });
    items = itemsFromCartons(po.cartons, catalog);
    warehouse = po.warehouses[0]?.prefix ?? null;
  }
  // No WMS lines yet: POM's SKU lines that aren't cancelled (ordered quantities), else THD's compliance lines
  if (!items.length && po?.pom?.lines.length)
    items = po.pom.lines
      .filter((l) => !/^cancel/i.test(l.status ?? ""))
      .map((l) => ({ thdSku: l.thdSku ?? "", vendorSku: l.partNumber ?? "", description: l.description ?? "", units: l.adjOrderQty ?? l.orderQty ?? 0 }));
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

  // Destination: the WMS ship-to of the PO's cartons (Store/DC number, name and full address); else the
  // Store/DC from TMS (or THD's DC number) with its saved address, or the address the WMS last shipped
  // to there for another PO, else its city
  const shipTo = po?.shipTo ?? null;
  const facility = (shipTo?.facility ?? (po?.pom ? (po.pom.finalRecvLocation ?? po.pom.destinationDc) : null) ?? po?.dest.facility ?? record?.dcNumber ?? "").trim().toUpperCase();
  const channel = po?.channels[0]?.code ?? null;
  slip.destFacility = facility;
  const nameFor = (name: string | null) => (name && !genericName(name) ? name : destinationName(facility || null, channel));
  let saved = null;
  if (shipTo?.street.length) {
    slip.destName = nameFor(shipTo.name);
    slip.destAddress = addressLines(shipTo).join("\n");
  } else if (facility && (saved = await prisma.destinationAddress.findUnique({ where: { facility } }))) {
    slip.destName = saved.name;
    slip.destAddress = saved.address;
  } else {
    const other = facility ? await lastWmsAddress(facility) : null;
    slip.destName = nameFor(other?.name ?? null);
    slip.destAddress = other
      ? addressLines(other).join("\n")
      : shipTo
        ? addressLines(shipTo).join("\n")
        : cityLine(po?.dest.city ?? null, po?.dest.state ?? null, null);
  }

  return { slip, sources: { logistics: Boolean(po), compliance: Boolean(record) || items.some((i) => i.thdSku), pom: Boolean(po?.pom), addressBook: Boolean(saved) }, warehouse };
}

/** The address the WMS last shipped to for a Store/DC (any PO), when its lines give one */
async function lastWmsAddress(facility: string) {
  const key = facilityKey(facility);
  const rows = await prisma.wmsCarton.findMany({
    where: { shipAddress1: { not: null }, OR: [{ shipTo: { in: [...new Set([facility, key])] } }, { shipName: { contains: key } }] },
    orderBy: { shippedAt: "desc" },
    take: 20,
    select: { shipTo: true, shipName: true, shipAddress1: true, shipAddress2: true, shipAddress3: true, shipCity: true, shipState: true, shipZip: true },
  });
  const hit = rows.map((r) => shipToOf(r)).find((t) => t.facility && facilityKey(t.facility) === key);
  return hit ?? null;
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
