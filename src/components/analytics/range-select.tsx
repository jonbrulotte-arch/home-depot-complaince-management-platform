"use client";

import { usePathname, useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ANALYTICS_RANGES } from "@/lib/view-analytics-shared";

/** Picks the time window (?days=) for the View Analytics pages. */
export function RangeSelect({ days }: { days: number }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Select value={String(days)} onValueChange={(v) => router.push(`${pathname}?days=${v}`)}>
      <SelectTrigger className="w-44" aria-label="Time range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ANALYTICS_RANGES.map((r) => (
          <SelectItem key={r.days} value={String(r.days)}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
