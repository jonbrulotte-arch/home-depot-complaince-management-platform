// Warehouses (Admin › Settings): which warehouse shipped a carton, from the start of the WMS
// OrderNumber ("3-S-ORD1005437" is Site 3). Pure and safe in the browser.

export interface WarehouseInfo {
  /** The OrderNumber prefix, e.g. "3-" */
  prefix: string;
  name: string;
}

/** The filter value for POs and shipments whose warehouse isn't known */
export const UNKNOWN_WAREHOUSE = "none";

/** A prefix as stored: trimmed, upper case */
export const cleanPrefix = (s: string) => s.trim().toUpperCase();

/** The warehouse an OrderNumber belongs to: the longest matching prefix, ignoring case */
export function warehouseOf(orderNumber: string | null | undefined, warehouses: WarehouseInfo[]): WarehouseInfo | null {
  const v = orderNumber?.trim().toUpperCase();
  if (!v) return null;
  let best: WarehouseInfo | null = null;
  for (const w of warehouses) if (v.startsWith(cleanPrefix(w.prefix)) && (!best || w.prefix.length > best.prefix.length)) best = w;
  return best;
}

/** The warehouses of some cartons, in the admins' order */
export function warehousesOf(cartons: { orderNumber?: string | null }[], warehouses: WarehouseInfo[]): WarehouseInfo[] {
  const found = new Set(cartons.map((c) => warehouseOf(c.orderNumber, warehouses)?.prefix).filter(Boolean));
  return warehouses.filter((w) => found.has(w.prefix));
}

/** Whether an item's warehouses match a filter value (a prefix, or UNKNOWN_WAREHOUSE) */
export function matchesWarehouse(items: WarehouseInfo[], wh: string | undefined): boolean {
  if (!wh) return true;
  if (wh === UNKNOWN_WAREHOUSE) return items.length === 0;
  return items.some((w) => w.prefix === wh);
}

/** Sort position by warehouse: the first of an item's warehouses in the admins' order, unknown last */
export function warehouseRank(items: WarehouseInfo[], warehouses: WarehouseInfo[]): number {
  const i = items.length ? warehouses.findIndex((w) => w.prefix === items[0].prefix) : -1;
  return i === -1 ? warehouses.length : i;
}

/** Names for display, e.g. "Ohio Warehouse (Site 3)" */
export const warehouseNames = (items: WarehouseInfo[]) => items.map((w) => w.name).join(", ");
