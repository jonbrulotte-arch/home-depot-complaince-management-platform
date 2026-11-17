import { z } from "zod";

// The Packing Slip Generator: a slip's content, filled in from a PO's WMS, TMS and THD data and
// edited before it is downloaded. Pure (unit-tested) and safe in the browser.

export interface SlipItem {
  /** THD's SKU (Home Depot SKU #) */
  thdSku: string;
  /** Our SKU (the WMS product) */
  vendorSku: string;
  description: string;
  units: number;
}

export interface PackingSlip {
  poNumber: string;
  /** YYYY-MM-DD */
  poDate: string;
  /** YYYY-MM-DD */
  shipDate: string;
  shipmentId: string;
  carrier: string;
  /** Cartons in the shipment (WMS labels) */
  cartons: string;
  originName: string;
  originAddress: string;
  destName: string;
  destAddress: string;
  /** The destination's Store/DC number, which keys the address book */
  destFacility: string;
  items: SlipItem[];
  notes: string;
}

export const DEFAULT_SLIP_NOTES = "All items packaged according to Home Depot shipping standards. Handle with care.";

export const MAX_SLIP_ITEMS = 200;

export function emptySlip(): PackingSlip {
  return { poNumber: "", poDate: "", shipDate: "", shipmentId: "", carrier: "", cartons: "", originName: "", originAddress: "", destName: "", destAddress: "", destFacility: "", items: [], notes: DEFAULT_SLIP_NOTES };
}

const line = (max: number) => z.string().max(max).transform((s) => s.trim());
const day = z
  .string()
  .trim()
  .refine((s) => s === "" || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))), "Use a date (YYYY-MM-DD)");

/** A slip as sent from the editor, trimmed and checked */
export const slipSchema = z.object({
  poNumber: line(40).refine((s) => s.length > 0, "Enter the PO number"),
  poDate: day,
  shipDate: day,
  shipmentId: line(60),
  carrier: line(80),
  cartons: line(20),
  originName: line(120),
  originAddress: z.string().max(500).transform((s) => s.trim()),
  destName: line(120),
  destAddress: z.string().max(500).transform((s) => s.trim()),
  destFacility: line(20).transform((s) => s.toUpperCase()),
  items: z
    .array(
      z.object({
        thdSku: line(40),
        vendorSku: line(40),
        description: line(300),
        units: z.coerce.number().min(0).max(1_000_000).transform((n) => Math.round(n)),
      }),
    )
    .max(MAX_SLIP_ITEMS)
    // Blank rows are dropped
    .transform((items) => items.filter((i) => i.thdSku || i.vendorSku || i.description || i.units)),
  notes: z.string().max(2000).transform((s) => s.trim()),
});

/** THD's SKU and description for one of our SKUs, from THD's compliance data */
export interface CatalogEntry {
  thdSku: string | null;
  description: string | null;
}

/**
 * The slip's items from a PO's WMS lines: one per product (our SKU), units added up, in the order
 * first shipped, with THD's SKU and description where THD's data has the product.
 */
export function itemsFromCartons(cartons: { product: string | null; quantity: number | null }[], catalog: Map<string, CatalogEntry>): SlipItem[] {
  const out = new Map<string, SlipItem>();
  for (const c of cartons) {
    const sku = c.product?.trim() ?? "";
    if (!sku) continue;
    const item = out.get(sku) ?? { vendorSku: sku, thdSku: catalog.get(sku)?.thdSku ?? "", description: catalog.get(sku)?.description ?? "", units: 0 };
    item.units += c.quantity ?? 0;
    out.set(sku, item);
  }
  return [...out.values()];
}

/** "Home Depot DFC #6007" for a DFC destination, "Home Depot RDC #5023" for an RDC, "Home Depot #5023" otherwise */
export function destinationName(facility: string | null, channelCode: string | null): string {
  if (!facility) return "";
  const kind = channelCode === "THD.COM-DFDC" ? "DFC " : channelCode === "THD" ? "RDC " : /^XD/i.test(facility) ? "Crossdock " : "";
  return `Home Depot ${kind}#${facility}`;
}

/** "DALLAS, TX 75241" from the WMS ship-to */
export function cityLine(city: string | null, state: string | null, zip: string | null): string {
  return [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
}

/** Whether a dispute reason code's documents include a packing slip (THD calls it a "packing list") */
export function needsPackingSlip(...docs: (string | null | undefined)[]): boolean {
  return docs.some((d) => Boolean(d && /\bpack(?:ing)?\s*(?:list|slip)s?\b|\bpackslips?\b/i.test(d)));
}

/** The Packing Slip Generator, filled in for a PO */
export const packingSlipHref = (poNumber: string) => `/packing-slips?po=${encodeURIComponent(poNumber)}`;

export const slipFileName = (poNumber: string, ext: "pdf" | "xlsx") => `Packing_Slip_${poNumber.replace(/[^\w-]/g, "_") || "PO"}.${ext}`;

export const totalUnits = (items: SlipItem[]) => items.reduce((n, i) => n + (Number(i.units) || 0), 0);
