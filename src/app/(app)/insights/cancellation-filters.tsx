"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANCEL_SOURCE_LABELS } from "@/lib/cancellations";

const ALL = "all";
/** The tab's own filters, kept in the address beside the page's time frame and program */
export const CANCEL_KEYS = ["source", "team", "dc", "sku", "scope", "dispute", "vendor", "reason", "q"] as const;
type Key = (typeof CANCEL_KEYS)[number];

/** Filters for Reports & Insights › Cancellations, and its export */
export function CancellationFilters({ values, teams, dcs, vendors, reasons }: { values: Partial<Record<Key, string>>; teams: string[]; dcs: string[]; vendors: string[]; reasons: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [text, setText] = useState({ sku: values.sku ?? "", q: values.q ?? "" });
  const query = (next: Partial<Record<Key, string | undefined>>) => {
    const p = new URLSearchParams(current.toString());
    for (const [k, v] of Object.entries({ ...values, ...text, ...next })) {
      if (v && v !== ALL) p.set(k, v);
      else p.delete(k);
    }
    return p;
  };
  const apply = (next: Partial<Record<Key, string | undefined>> = {}) => router.push(`${pathname}?${query(next)}`);
  const exportHref = (format?: "pdf") => {
    const p = query({});
    p.delete("tab");
    if (format) p.set("format", format);
    return `/api/insights/cancellations?${p}`;
  };
  const pick = (id: string, label: string, key: Key, options: [string, string][], width: string) => (
    <div className={width}>
      <span className="mb-1 block text-xs font-medium text-gray-500" id={id}>
        {label}
      </span>
      <Select value={values[key] || ALL} onValueChange={(v) => apply({ [key]: v === ALL ? undefined : v })}>
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
  const filtered = CANCEL_KEYS.some((k) => values[k]);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-64">
        <label htmlFor="can-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="can-q" value={text.q} onChange={(e) => setText({ ...text, q: e.target.value })} placeholder="PO, SKU, description, cause, issue" />
      </div>
      <div className="w-40">
        <label htmlFor="can-sku" className="mb-1 block text-xs font-medium text-gray-500">
          SKU
        </label>
        <Input id="can-sku" value={text.sku} onChange={(e) => setText({ ...text, sku: e.target.value })} placeholder="THD or our SKU" />
      </div>
      {pick("can-source", "Source", "source", [[ALL, "Any source"], ...Object.entries(CANCEL_SOURCE_LABELS)], "w-52")}
      {pick("can-scope", "Cancelled", "scope", [[ALL, "PO or SKU"], ["po", "Whole PO"], ["sku", "SKU line"]], "w-40")}
      {pick("can-dispute", "Dispute", "dispute", [[ALL, "Any"], ["none", "Not disputed"], ["open", "Disputed, awaiting decision"], ["won", "Won (recovered)"], ["lost", "Denied"]], "w-56")}
      {pick("can-team", "Team responsible", "team", [[ALL, "Any team"], ...teams.map((t): [string, string] => [t, t])], "w-52")}
      {pick("can-dc", "Destination", "dc", [[ALL, "Any Store/DC"], ...dcs.map((d): [string, string] => [d, d])], "w-40")}
      {vendors.length > 1 && pick("can-vendor", "Vendor # (POM)", "vendor", [[ALL, "Any vendor #"], ...vendors.map((v): [string, string] => [v, v])], "w-40")}
      {reasons.length > 1 && pick("can-reason", "PO reason code (POM)", "reason", [[ALL, "Any reason code"], ...reasons.map((v): [string, string] => [v, v])], "w-48")}
      <Button type="submit" variant="outline">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {filtered && (
        <Button type="button" variant="ghost" onClick={() => apply(Object.fromEntries(CANCEL_KEYS.map((k) => [k, undefined])))}>
          Clear
        </Button>
      )}
      <div className="ml-auto flex gap-2">
        <Button asChild variant="outline">
          <a href={exportHref("pdf")}>
            <FileText className="h-4 w-4 mr-1.5" />
            PDF report
          </a>
        </Button>
        <Button asChild variant="outline">
          <a href={exportHref()}>
            <Download className="h-4 w-4 mr-1.5" />
            Excel
          </a>
        </Button>
      </div>
    </form>
  );
}
