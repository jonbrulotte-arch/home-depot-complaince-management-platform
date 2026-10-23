import type { MetricStat } from "@/lib/reports";
import type { ScorecardShipments } from "@/lib/scorecard";
import { SHIPMENT_RANGES } from "@/lib/shipment-ranges";

/**
 * Whether a metric meets its goal after disputes. Without a percentage (only violations were
 * exported), a per-violation metric meets it when no violation stands; a percentage-of-value
 * metric is only known to miss it when THD charged an offset, since THD charges below the goal.
 */
export function meetsGoal(m: Pick<MetricStat, "thresholdPct" | "postDisputePct" | "offsetType" | "nonCompliant" | "approved" | "postDisputeOffset">): boolean | null {
  if (m.thresholdPct == null) return null;
  if (m.postDisputePct != null) return m.postDisputePct >= m.thresholdPct;
  if (m.offsetType === "PCT_VALUE") return m.postDisputeOffset > 0 ? false : null;
  return m.nonCompliant - m.approved === 0;
}

export interface ShipmentRow {
  label: string;
  /** Section heading rows carry no values */
  heading?: boolean;
  bold?: boolean;
  values: (number | null)[];
  total: number | null;
}

/**
 * Rows for the scorecard's shipment table, one column per program: each compliance period's
 * Small Parcel and LTL & TL, then the combined totals. Older snapshots have only the totals.
 */
export function shipmentRows(sh: ScorecardShipments): ShipmentRow[] {
  const combined: ShipmentRow[] = [
    { label: "Small Parcel", values: sh.programs.map((p) => p.smallParcel), total: sh.totals.smallParcel },
    { label: "LTL & TL", values: sh.programs.map((p) => p.ltl), total: sh.totals.ltl },
    { label: "Total", bold: true, values: sh.programs.map((p) => p.total), total: sh.totals.total },
  ];
  const periods = sh.totals.periods;
  if (!periods || sh.programs.some((p) => !p.periods)) return combined;
  return [
    ...SHIPMENT_RANGES.flatMap(({ key, label }) => [
      { label, heading: true, values: [], total: null },
      { label: "Small Parcel", values: sh.programs.map((p) => p.periods![key].smallParcel), total: periods[key].smallParcel },
      { label: "LTL & TL", values: sh.programs.map((p) => p.periods![key].ltl), total: periods[key].ltl },
    ]),
    { label: "Both periods", heading: true, values: [], total: null },
    ...combined,
  ];
}
