"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ISSUE_CATEGORIES, ISSUE_STATUSES, type IssueFilters } from "@/lib/issues";

const ALL = "all";

/** Search, status, category and date filters for the Issue Log, kept in the address. */
export function IssueFiltersBar({ filters }: { filters: IssueFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const query = (next: Partial<IssueFilters>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, q, from, to, ...next })) if (v) params.set(k, v);
    return params.toString();
  };
  const apply = (next: Partial<IssueFilters> = {}) => router.push(`${pathname}?${query(next)}`);
  const active = Boolean(filters.q || filters.status || filters.category || filters.from || filters.to);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-64">
        <label htmlFor="issue-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="issue-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO, ticket #, ISS-0001, words" />
      </div>
      <div className="w-44">
        <span className="mb-1 block text-xs font-medium text-gray-500">Status</span>
        <Select value={filters.status || ALL} onValueChange={(s) => apply({ status: s === ALL ? undefined : s })}>
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            <SelectItem value="OPEN_ANY">Open or in progress</SelectItem>
            {Object.entries(ISSUE_STATUSES).map(([k, s]) => (
              <SelectItem key={k} value={k}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-52">
        <span className="mb-1 block text-xs font-medium text-gray-500">Category</span>
        <Select value={filters.category || ALL} onValueChange={(c) => apply({ category: c === ALL ? undefined : c })}>
          <SelectTrigger aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any category</SelectItem>
            {ISSUE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label htmlFor="issue-from" className="mb-1 block text-xs font-medium text-gray-500">
          From
        </label>
        <Input id="issue-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
      </div>
      <div>
        <label htmlFor="issue-to" className="mb-1 block text-xs font-medium text-gray-500">
          To
        </label>
        <Input id="issue-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>
      <Button type="submit">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {active && (
        <Button type="button" variant="ghost" onClick={() => router.push(pathname)}>
          Clear
        </Button>
      )}
      <Button asChild variant="outline" className="ml-auto">
        <a href={`/api/issues/export?${query({})}`}>
          <Download className="h-4 w-4 mr-1.5" />
          Export to Excel
        </a>
      </Button>
    </form>
  );
}
