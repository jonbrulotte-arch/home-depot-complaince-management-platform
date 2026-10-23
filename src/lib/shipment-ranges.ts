import type { ShipmentPeriod } from "@prisma/client";

// Date ranges the shipment counts cover (database-free, so client components can use it).
// THD reports Fill Rate and On Time two months behind the other metrics, so a report collects
// two ranges, and shipment counts for each; together they make the report's totals.

/** Dates are ISO calendar dates, YYYY-MM-DD */
export interface DateRange {
  from: string;
  to: string;
}

export interface ShipmentRanges {
  fillOnTime: DateRange | null;
  other: DateRange | null;
}

export const SHIPMENT_RANGES: { key: keyof ShipmentRanges; period: ShipmentPeriod; label: string; hint: string }[] = [
  { key: "fillOnTime", period: "FILL_ON_TIME", label: "On-Time & Fill Rate", hint: "Two months before the other data" },
  { key: "other", period: "OTHER", label: "All other data", hint: "ASN, TMS, Routing Guide and the rest" },
];

/** How many months Fill Rate and On Time trail the other metrics */
export const FILL_ON_TIME_LAG_MONTHS = 2;

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function range(from: Date | null, to: Date | null): DateRange | null {
  const f = iso(from);
  const t = iso(to);
  return f && t ? { from: f, to: t } : null;
}

/** The ranges stored on a report */
export function reportShipmentRanges(report: { fillOnTimeFrom: Date | null; fillOnTimeTo: Date | null; otherFrom: Date | null; otherTo: Date | null }): ShipmentRanges {
  return { fillOnTime: range(report.fillOnTimeFrom, report.fillOnTimeTo), other: range(report.otherFrom, report.otherTo) };
}

/** Shifts an ISO date by whole months, keeping the day where it exists (Mar 31 − 1 month = Feb 28/29). */
export function shiftIsoDate(value: string, months: number): string {
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return iso(target)!;
}

/** "07/01/2026 - 07/31/2026" */
export function formatDateRange(r: DateRange | null | undefined): string {
  if (!r) return "Not entered";
  const us = (v: string) => `${v.slice(5, 7)}/${v.slice(8, 10)}/${v.slice(0, 4)}`;
  return `${us(r.from)} - ${us(r.to)}`;
}
