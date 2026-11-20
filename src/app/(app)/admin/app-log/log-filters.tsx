"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOG_CATEGORIES, type LogFilters } from "@/lib/app-log";

const ALL = "all";

/** Search, user, category and date filters for the App Log; they live in the address so a view can be shared. */
export function LogFiltersBar({ filters, users }: { filters: LogFilters; users: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(filters.q ?? "");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");

  const query = (next: Partial<LogFilters>) => {
    const merged: LogFilters = { ...filters, q, from, to, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return params.toString();
  };
  const apply = (next: Partial<LogFilters> = {}) => router.push(`${pathname}?${query(next)}`);
  const active = Boolean(filters.q || filters.userId || filters.category || filters.from || filters.to);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="w-64">
        <label htmlFor="log-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="log-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Event, user, email or ID" />
      </div>
      <div className="w-48">
        <span className="mb-1 block text-xs font-medium text-gray-500">User</span>
        <Select value={filters.userId || ALL} onValueChange={(v) => apply({ userId: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label="User">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Everyone</SelectItem>
            <SelectItem value="none">No user (failed sign-ins, public links)</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-52">
        <span className="mb-1 block text-xs font-medium text-gray-500">Category</span>
        <Select value={filters.category || ALL} onValueChange={(v) => apply({ category: v === ALL ? undefined : v })}>
          <SelectTrigger aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All events</SelectItem>
            {LOG_CATEGORIES.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label htmlFor="log-from" className="mb-1 block text-xs font-medium text-gray-500">
          From
        </label>
        <Input id="log-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
      </div>
      <div>
        <label htmlFor="log-to" className="mb-1 block text-xs font-medium text-gray-500">
          To
        </label>
        <Input id="log-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
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
        <a href={`/api/admin/app-log/export?${query({})}`}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </a>
      </Button>
    </form>
  );
}
