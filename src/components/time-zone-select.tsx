"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMON_TIME_ZONES, allTimeZones, browserTimeZone, timeZoneLabel } from "@/lib/time-zones";

const AUTO = "auto";
const noSubscribe = () => () => {};

/** This browser's time zone; null while rendering on the server. */
export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noSubscribe, browserTimeZone, () => null);
}

/**
 * Picks the zone to show times in. null is "Automatic": follow the browser the user is on, so
 * someone travelling or on two computers sees their local time on each.
 */
export function TimeZoneSelect({ id, value, onChange, disabled }: { id?: string; value: string | null; onChange: (tz: string | null) => void; disabled?: boolean }) {
  const browser = useBrowserTimeZone();
  const { common, others } = useMemo(() => {
    const now = new Date();
    const all = allTimeZones();
    const commonSet = new Set<string>(COMMON_TIME_ZONES);
    return {
      common: COMMON_TIME_ZONES.map((tz) => ({ tz, label: timeZoneLabel(tz, now) })),
      others: all.filter((tz) => !commonSet.has(tz)).map((tz) => ({ tz, label: timeZoneLabel(tz, now) })),
    };
  }, []);
  // A saved zone missing from this browser's list still shows
  const extra = value && !common.some((z) => z.tz === value) && !others.some((z) => z.tz === value) ? [{ tz: value, label: value }] : [];

  return (
    <Select value={value ?? AUTO} onValueChange={(v) => onChange(v === AUTO ? null : v)} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>Automatic: this browser&apos;s time zone{browser ? ` (${timeZoneLabel(browser)})` : ""}</SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>United States</SelectLabel>
          {common.map((z) => (
            <SelectItem key={z.tz} value={z.tz}>
              {z.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>All time zones</SelectLabel>
          {[...extra, ...others].map((z) => (
            <SelectItem key={z.tz} value={z.tz}>
              {z.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
