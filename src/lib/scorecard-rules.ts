import type { MetricStat } from "@/lib/reports";

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
