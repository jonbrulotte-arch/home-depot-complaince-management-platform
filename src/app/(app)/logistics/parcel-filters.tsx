"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEST_SORTS, PARCEL_STATES, type ParcelFilters } from "@/lib/logistics/views";
import { UNKNOWN_WAREHOUSE, type WarehouseInfo } from "@/lib/logistics/warehouses";
import { UNKNOWN_CHANNEL, type ChannelInfo } from "@/lib/logistics/channels";
import { PoRangePicker } from "./range-picker";

const ALL = "all";

/** Search, filters and sort for the UPS parcels tab, kept in the address */
export function ParcelFiltersBar({ filters, warehouses, channels, counts }: { filters: ParcelFilters; warehouses: WarehouseInfo[]; channels: ChannelInfo[]; counts: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const apply = (next: Partial<ParcelFilters> = {}) => {
    const p = new URLSearchParams({ tab: "parcels" });
    for (const [k, v] of Object.entries({ ...filters, q, ...next })) if (v && v !== ALL) p.set(k, v);
    router.push(`${pathname}?${p}`);
  };
  const pick = (id: string, label: string, value: string | undefined, options: [string, string][], key: keyof ParcelFilters, width: string) => (
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
  const any = Boolean(filters.q || filters.state || filters.ch || filters.wh || filters.range || filters.sort);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-64">
        <label htmlFor="parcel-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="parcel-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tracking #, PO or destination" />
      </div>
      {pick("parcel-state", "UPS status", filters.state, [[ALL, "Any status"], ...PARCEL_STATES.map((s): [string, string] => [s.key, `${s.label} (${counts[s.key] ?? 0})`])], "state", "w-52")}
      {pick("parcel-ch", "Channel", filters.ch, [[ALL, "Any channel"], ...channels.map((c): [string, string] => [c.code, c.name]), [UNKNOWN_CHANNEL, "Unknown channel"]], "ch", "w-64")}
      {pick("parcel-wh", "Warehouse", filters.wh, [[ALL, "Any warehouse"], ...warehouses.map((w): [string, string] => [w.prefix, w.name]), [UNKNOWN_WAREHOUSE, "Unknown warehouse"]], "wh", "w-56")}
      <div>
        <label htmlFor="parcel-range" className="mb-1 block text-xs font-medium text-gray-500">
          Shipped (WMS)
        </label>
        <PoRangePicker id="parcel-range" value={{ range: filters.range, from: filters.from, to: filters.to }} onChange={(r) => apply({ range: r.range, from: r.from, to: r.to })} />
      </div>
      {pick("parcel-sort", "Sort", filters.sort, [[ALL, "Latest shipped first"], ["expected", "Expected delivery (soonest)"], ["status", "UPS status"], ...DEST_SORTS.map((d): [string, string] => [d.key, d.label])], "sort", "w-56")}
      <Button type="submit" variant="outline">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {any && (
        <Button type="button" variant="ghost" onClick={() => router.push(`${pathname}?tab=parcels`)}>
          Clear
        </Button>
      )}
    </form>
  );
}
