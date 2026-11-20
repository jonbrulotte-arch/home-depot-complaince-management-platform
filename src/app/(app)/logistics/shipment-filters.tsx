"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNKNOWN_WAREHOUSE, type WarehouseInfo } from "@/lib/logistics/warehouses";
import { UNKNOWN_CHANNEL, type ChannelInfo } from "@/lib/logistics/channels";
import { ASN_FILTERS, DEST_SORTS } from "@/lib/logistics/views";
import { PoRangePicker } from "./range-picker";

const ALL = "all";

type Filters = { q?: string; status?: string; flag?: string; severity?: string; asn?: string; range?: string; from?: string; to?: string; scac?: string; late?: string; wh?: string; ch?: string; sort?: string };

/** Search and filters for the Shipments tab, kept in the address. */
export function ShipmentFiltersBar({
  filters,
  statuses,
  flags,
  scacs,
  warehouses,
  channels,
}: {
  filters: Filters;
  statuses: string[];
  flags: { code: string; label: string; count: number }[];
  scacs: string[];
  warehouses: WarehouseInfo[];
  channels: ChannelInfo[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const apply = (next: Partial<Filters> = {}) => {
    const p = new URLSearchParams({ tab: "shipments" });
    for (const [k, v] of Object.entries({ ...filters, q, ...next })) if (v && v !== ALL) p.set(k, v);
    router.push(`${pathname}?${p}`);
  };
  const pick = (id: string, label: string, value: string | undefined, options: [string, string][], key: keyof Filters, width: string) => (
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
  const filtered = Object.entries(filters).some(([k, v]) => k !== "sort" && v);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-72">
        <label htmlFor="ship-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="ship-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Shipment, PO, PRO, UPS, SCAC, DC, city" />
      </div>
      {pick("ship-status", "Status", filters.status, [[ALL, "Any status"], ...statuses.map((s): [string, string] => [s, s])], "status", "w-40")}
      {pick("ship-sev", "Needs attention", filters.severity, [[ALL, "All shipments"], ["any", "Flagged (high or medium)"], ["high", "High"], ["medium", "Medium"], ["info", "Info"]], "severity", "w-52")}
      {pick("ship-flag", "Flag", filters.flag, [[ALL, "Any flag"], ...flags.map((f): [string, string] => [f.code, `${f.label} (${f.count})`])], "flag", "w-60")}
      {pick("ship-asn", "ASN", filters.asn, [[ALL, "Any"], ...ASN_FILTERS.map((a): [string, string] => [a.key, a.key === "received" ? "ASN received (all POs)" : a.label])], "asn", "w-48")}
      {pick("ship-scac", "Carrier", filters.scac, [[ALL, "Any carrier"], ...scacs.map((s): [string, string] => [s, s])], "scac", "w-36")}
      {pick("ship-late", "Timing", filters.late, [[ALL, "Any"], ["1", "Late or not picked up"]], "late", "w-48")}
      {pick("ship-wh", "Warehouse", filters.wh, [[ALL, "Any warehouse"], ...warehouses.map((w): [string, string] => [w.prefix, w.name]), [UNKNOWN_WAREHOUSE, "No WMS cartons yet"]], "wh", "w-56")}
      {pick("ship-ch", "Channel", filters.ch, [[ALL, "Any channel"], ...channels.map((c): [string, string] => [c.code, c.name]), [UNKNOWN_CHANNEL, "No WMS cartons yet"]], "ch", "w-64")}
      {pick("ship-sort", "Sort", filters.sort, [[ALL, "Latest pickup first"], ["warehouse", "Warehouse"], ...DEST_SORTS.map((d): [string, string] => [d.key, d.label])], "sort", "w-52")}
      <div>
        <label htmlFor="ship-range" className="mb-1 block text-xs font-medium text-gray-500">
          Pickup date
        </label>
        <PoRangePicker id="ship-range" value={{ range: filters.range, from: filters.from, to: filters.to }} onChange={(r) => apply({ range: r.range, from: r.from, to: r.to })} />
      </div>
      <Button type="submit" variant="outline">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {filtered && (
        <Button type="button" variant="ghost" onClick={() => router.push(`${pathname}?tab=shipments`)}>
          Clear
        </Button>
      )}
    </form>
  );
}
