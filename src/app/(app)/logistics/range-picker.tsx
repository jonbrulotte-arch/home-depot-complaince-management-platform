"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PO_RANGES, type PoFilters } from "@/lib/logistics/views";
import { UNKNOWN_WAREHOUSE, type WarehouseInfo } from "@/lib/logistics/warehouses";

type Range = Pick<PoFilters, "range" | "from" | "to">;

/** A date range for POs: the presets, or Custom with From and To dates (applied with Apply). */
export function PoRangePicker({ value, onChange, id = "po-range" }: { value: Range; onChange: (r: Range) => void; id?: string }) {
  const current = value.range && PO_RANGES.some((r) => r.key === value.range) ? value.range : "all";
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [custom, setCustom] = useState(current === "custom");
  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <Select
        value={custom ? "custom" : current}
        onValueChange={(v) => {
          if (v === "custom") setCustom(true);
          else {
            setCustom(false);
            onChange({ range: v === "all" ? undefined : v, from: undefined, to: undefined });
          }
        }}
      >
        <SelectTrigger id={id} className="w-40" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PO_RANGES.map((r) => (
            <SelectItem key={r.key} value={r.key}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {custom && (
        <>
          <Input type="date" aria-label="From" className="w-36" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          <span className="pb-2 text-sm text-gray-500">to</span>
          <Input type="date" aria-label="To" className="w-36" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          <Button type="button" variant="outline" disabled={!from && !to} onClick={() => onChange({ range: "custom", from: from || undefined, to: to || undefined })}>
            Apply
          </Button>
        </>
      )}
    </div>
  );
}

/** The warehouse and date range on the Overview's What's flagged, kept in the address */
export function OverviewRangePicker({ value, warehouses }: { value: Range & { wh?: string }; warehouses: WarehouseInfo[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: Partial<Range & { wh?: string }>) => {
    const p = new URLSearchParams({ tab: "overview" });
    for (const [k, v] of Object.entries({ ...value, ...next })) if (v) p.set(k, v);
    router.push(`${pathname}?${p}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-end justify-end gap-2">
      <Select value={value.wh || "all"} onValueChange={(v) => go({ wh: v === "all" ? undefined : v })}>
        <SelectTrigger id="flag-wh" className="w-56" aria-label="Warehouse">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any warehouse</SelectItem>
          {warehouses.map((w) => (
            <SelectItem key={w.prefix} value={w.prefix}>
              {w.name}
            </SelectItem>
          ))}
          <SelectItem value={UNKNOWN_WAREHOUSE}>No WMS cartons yet</SelectItem>
        </SelectContent>
      </Select>
      <PoRangePicker id="flag-range" value={value} onChange={(r) => go({ range: r.range, from: r.from, to: r.to })} />
    </div>
  );
}
