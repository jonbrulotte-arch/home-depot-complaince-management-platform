"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

/** Search and status for the Emails tab, kept in the address */
export function EmailFilters({ q: initial, status }: { q?: string; status?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(initial ?? "");
  const go = (next: { q?: string; status?: string }) => {
    const p = new URLSearchParams({ tab: "emails" });
    const v = { q, status, ...next };
    if (v.q?.trim()) p.set("q", v.q.trim());
    if (v.status && v.status !== ALL) p.set("status", v.status);
    router.push(`${pathname}?${p}`);
  };
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        go({});
      }}
    >
      <div className="w-80">
        <label htmlFor="email-q" className="mb-1 block text-xs font-medium text-gray-500">
          Search
        </label>
        <Input id="email-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO, shipment, subject, recipient, team, sender" />
      </div>
      <div className="w-40">
        <span id="email-status" className="mb-1 block text-xs font-medium text-gray-500">
          Status
        </span>
        <Select value={status || ALL} onValueChange={(v) => go({ status: v })}>
          <SelectTrigger aria-labelledby="email-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="failed">Not sent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" variant="outline">
        <Search className="h-4 w-4 mr-1.5" />
        Search
      </Button>
      {(initial || status) && (
        <Button type="button" variant="ghost" onClick={() => router.push(`${pathname}?tab=emails`)}>
          Clear
        </Button>
      )}
    </form>
  );
}
