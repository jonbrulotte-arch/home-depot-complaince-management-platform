"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNKNOWN_WAREHOUSE, type WarehouseInfo } from "@/lib/logistics/warehouses";

const ALL = "all";

/** Warehouse and sort for the Shipments tab, kept in the address with its carrier and late filters */
export function ShipmentFiltersBar({ filters, warehouses }: { filters: { scac?: string; late?: string; wh?: string; sort?: string }; warehouses: WarehouseInfo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const apply = (next: Partial<typeof filters>) => {
    const p = new URLSearchParams({ tab: "shipments" });
    for (const [k, v] of Object.entries({ ...filters, ...next })) if (v && v !== ALL) p.set(k, v);
    router.push(`${pathname}?${p}`);
  };
  const pick = (id: string, label: string, value: string | undefined, options: [string, string][], key: "wh" | "sort", width: string) => (
    <div className={width}>
      <span className="mb-1 block text-xs font-medium text-gray-500" id={id}>
        {label}
      </span>
      <Select value={value || ALL} onValueChange={(v) => apply({ [key]: v === ALL ? undefined : v })}>
        <SelectTrigger aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-3">
      {pick("ship-wh", "Warehouse", filters.wh, [[ALL, "Any warehouse"], ...warehouses.map((w): [string, string] => [w.prefix, w.name]), [UNKNOWN_WAREHOUSE, "No WMS cartons yet"]], "wh", "w-56")}
      {pick("ship-sort", "Sort", filters.sort, [[ALL, "Latest pickup first"], ["warehouse", "Warehouse"]], "sort", "w-48")}
    </div>
  );
}
