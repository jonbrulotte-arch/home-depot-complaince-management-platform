"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PoFilters } from "@/lib/logistics/views";

const ALL = "all";

/** Search and filters for the POs tab, kept in the address. */
export function PoFiltersBar({ filters, statuses, flags, scacs }: { filters: PoFilters; statuses: string[]; flags: { code: string; label: string; pos: number }[]; scacs: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const query = (next: Partial<PoFilters>) => {
    const params = new URLSearchParams({ tab: "pos" });
    for (const [k, v] of Object.entries({ ...filters, q, ...next })) if (v) params.set(k, v);
    return params;
  };
  const apply = (next: Partial<PoFilters> = {}) => router.push(`${pathname}?${query(next)}`);
  const exportHref = () => {
    const p = query({});
    p.delete("tab");
    return `/api/logistics/export?${p}`;
  };
  const pick = (id: string, label: string, value: string | undefined, options: [string, string][], key: keyof PoFilters, width = "w-44") => (
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
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-72">
        <label htmlFor="log-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="log-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO, shipment, tracking, PRO, order, DC" />
      </div>
      {pick("log-status", "Status", filters.status, [[ALL, "Any status"], ...statuses.map((s): [string, string] => [s, s])], "status", "w-40")}
      {pick("log-sev", "Needs attention", filters.severity, [[ALL, "All POs"], ["any", "Flagged (high or medium)"], ["high", "High"], ["medium", "Medium"], ["info", "Info"]], "severity", "w-52")}
      {pick("log-flag", "Flag", filters.flag, [[ALL, "Any flag"], ...flags.map((f): [string, string] => [f.code, `${f.label} (${f.pos})`])], "flag", "w-60")}
      {pick("log-scac", "Carrier", filters.scac, [[ALL, "Any carrier"], ...scacs.map((s): [string, string] => [s, s])], "scac", "w-36")}
      <Button type="submit" variant="outline">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {Boolean(filters.q || filters.status || filters.flag || filters.severity || filters.scac) && (
        <Button type="button" variant="ghost" onClick={() => router.push(`${pathname}?tab=pos`)}>
          Clear
        </Button>
      )}
      <Button asChild variant="outline" className="ml-auto">
        <a href={exportHref()}>
          <Download className="h-4 w-4 mr-1.5" />
          Export to Excel
        </a>
      </Button>
    </form>
  );
}
