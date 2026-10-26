import type { MetricStat } from "@/lib/reports";
import type { ScorecardShipments } from "@/lib/scorecard";
import { SHIPMENT_RANGES } from "@/lib/shipment-ranges";

/**
 * Whether a metric meets its goal after disputes. Without a percentage (only violations were
 * exported), a per-violation metric meets it when no violation stands; a percentage-of-value
 * metric is only known to miss it when THD charged an offset, since THD charges below the goal.
 */
/**
 * US Drop Ship Fill Rate as THD defines it: (lines ship confirmed + lines that aren't violations)
 * ÷ lines closed. THD's Drop Ship Fill Rate sheet lists only the cancelled lines, so the shipped
 * lines come from the program's On Time sheet. `filled` counts the cancelled lines that don't count
 * against the supplier (Cancelled / Resolved, approved disputes).
 */
export function dropShipFillRatePct(shipped: number, cancelled: number, filled: number): number | null {
  const closed = shipped + cancelled;
  return shipped > 0 ? Math.min(100, ((shipped + filled) / closed) * 100) : null;
}

/** Key for a program's compliance period in the entered line counts */
export const lineCountKey = (programId: string, period: string) => `${programId}|${period}`;

/**
 * Compliance from a line count entered on the report, for metrics whose export lists only
 * violations: lines that aren't violations, plus the violations `cleared` (Cancelled / Resolved,
 * approved disputes), over all lines.
 */
export function enteredLinesPct(lines: number, violations: number, cleared: number): number | null {
  if (lines <= 0) return null;
  return Math.max(0, Math.min(100, ((lines - violations + cleared) / lines) * 100));
}

/**
 * Whether a percentage-of-value offset falls away after disputes. THD only charges it below the
 * threshold, so it falls away when disputes and resolutions lift the rate to the threshold. When
 * THD's own rate already met it, the charge stands until it is disputed.
 */
export function pctOffsetFallsAway(thdPct: number | null, postDisputePct: number | null, thresholdPct: number | null): boolean {
  if (postDisputePct === null || thresholdPct === null || postDisputePct < thresholdPct) return false;
  return thdPct === null || thdPct < thresholdPct;
}

export function meetsGoal(
  m: Pick<MetricStat, "thresholdPct" | "postDisputePct" | "offsetType" | "nonCompliant" | "approved" | "postDisputeOffset"> & { resolved?: number },
): boolean | null {
  if (m.thresholdPct == null) return null;
  if (m.postDisputePct != null) return m.postDisputePct >= m.thresholdPct;
  if (m.offsetType === "PCT_VALUE") return m.postDisputeOffset > 0 ? false : null;
  return m.nonCompliant - m.approved - (m.resolved ?? 0) <= 0;
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

/** The violation list's "Root cause / Notes" text: the root cause first, then the review notes. */
/** Feedback on a violation as text for the PDF and Excel: one "Author, date: comment" entry per note */
export function feedbackText(notes: { author: string | null; body: string; createdAt: string }[] | undefined): string {
  return (notes ?? [])
    .map((f) => `${f.author ?? "Former user"}, ${new Date(f.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}: ${f.body.trim()}`)
    .join("\n");
}

export function rootCauseAndNotes(v: { rootCause?: string | null; notes: string | null }): string {
  return [v.rootCause?.trim() ? `Root cause: ${v.rootCause.trim()}` : null, v.notes?.trim() || null].filter(Boolean).join("\n");
}
