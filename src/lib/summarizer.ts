import type { ScorecardData } from "@/lib/scorecard";

// Summarizer: one or more published scorecards rolled into a summary of their violations, grouped
// by compliance type, shown on the page and exported as a PDF. Pure, so it is unit-tested; the
// page loads the scorecards and supplies the links.

export const NOT_ASSIGNED = "Not assigned";
export const MAX_SUMMARY_REPORTS = 24;

/** Report ids from the address (`?r=a,b`), de-duplicated and capped */
export function parseReportIds(r: string | string[] | null | undefined): string[] {
  const ids = (Array.isArray(r) ? r.join(",") : (r ?? "")).split(",").map((id) => id.trim());
  return [...new Set(ids)].filter((id) => /^[a-z0-9]{20,40}$/i.test(id)).slice(0, MAX_SUMMARY_REPORTS);
}

export interface SummaryInput {
  reportId: string;
  title: string;
  data: ScorecardData;
  /** The public scorecard page (`/s/<token>`), or the sign-in page when there is no public link */
  scorecardPath: string;
  /**
   * Amount disputed on each line whose dispute is submitted and awaiting THD's decision now, by line
   * id. Read live, since a published snapshot keeps the status it had when generated; violations
   * without a line id (older snapshots) fall back to the snapshot's status and offset.
   */
  awaiting?: Record<string, number>;
}

export interface SummaryRow {
  reportId: string;
  periodLabel: string;
  poNumber: string | null;
  dcNumber: string | null;
  offset: number;
  team: string;
  /** Submitted for dispute and awaiting THD's decision; 0 when not */
  awaiting: number;
}

export interface SummaryGroup {
  program: string;
  metric: string;
  violations: number;
  offset: number;
  awaiting: number;
  awaitingDisputes: number;
  rows: SummaryRow[];
}

export interface SummaryReport {
  reportId: string;
  title: string;
  periodLabel: string;
  fiscalMonth: number;
  violations: number;
  preOffset: number;
  recovered: number;
  postOffset: number;
  awaiting: number;
  awaitingDisputes: number;
  scorecardPath: string;
}

export interface Summary {
  /** Oldest period first */
  reports: SummaryReport[];
  /** Compliance types in scorecard order (program, then metric) */
  groups: SummaryGroup[];
  /** Teams responsible, largest offset first */
  teams: { team: string; violations: number; offset: number; awaiting: number }[];
  totals: { violations: number; preOffset: number; recovered: number; postOffset: number; awaiting: number; awaitingDisputes: number };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function buildSummary(inputs: SummaryInput[]): Summary {
  const sorted = [...inputs].sort((a, b) => a.data.fiscalMonth - b.data.fiscalMonth);
  const groups = new Map<string, SummaryGroup>();
  // Program and metric order as the scorecards list them, so the summary reads like a scorecard
  const order: string[] = [];
  for (const { data } of sorted) {
    for (const p of data.programs) for (const m of p.metrics) if (!order.includes(`${p.name}|${m.name}`)) order.push(`${p.name}|${m.name}`);
  }
  const teams = new Map<string, { team: string; violations: number; offset: number; awaiting: number }>();
  const awaitingByReport = new Map<string, { amount: number; disputes: number }>();

  for (const { reportId, data, awaiting: live } of sorted) {
    const reportAwaiting = { amount: 0, disputes: 0 };
    for (const v of data.violations) {
      const key = `${v.program}|${v.metric}`;
      const group = groups.get(key) ?? { program: v.program, metric: v.metric, violations: 0, offset: 0, awaiting: 0, awaitingDisputes: 0, rows: [] };
      const team = v.teamInfluence?.trim() || NOT_ASSIGNED;
      const awaiting = v.lineId && live ? (live[v.lineId] ?? 0) : v.disputeStatus === "SUBMITTED" ? v.offset : 0;
      const isAwaiting = v.lineId && live ? v.lineId in live : v.disputeStatus === "SUBMITTED";
      group.rows.push({ reportId, periodLabel: data.periodLabel, poNumber: v.poNumber, dcNumber: v.dcNumber, offset: v.offset, team, awaiting });
      group.violations += 1;
      group.offset = round(group.offset + v.offset);
      group.awaiting = round(group.awaiting + awaiting);
      if (isAwaiting) group.awaitingDisputes += 1;
      groups.set(key, group);
      const t = teams.get(team) ?? { team, violations: 0, offset: 0, awaiting: 0 };
      t.violations += 1;
      t.offset = round(t.offset + v.offset);
      t.awaiting = round(t.awaiting + awaiting);
      teams.set(team, t);
      reportAwaiting.amount = round(reportAwaiting.amount + awaiting);
      if (isAwaiting) reportAwaiting.disputes += 1;
    }
    awaitingByReport.set(reportId, reportAwaiting);
  }

  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  const reports = sorted.map(({ reportId, title, data, scorecardPath }) => ({
    reportId,
    title,
    periodLabel: data.periodLabel,
    fiscalMonth: data.fiscalMonth,
    violations: data.totals.violations,
    preOffset: data.totals.preOffset,
    recovered: data.totals.recovered,
    postOffset: data.totals.postOffset,
    awaiting: awaitingByReport.get(reportId)!.amount,
    awaitingDisputes: awaitingByReport.get(reportId)!.disputes,
    scorecardPath,
  }));
  const sum = (f: (r: SummaryReport) => number) => round(reports.reduce((s, r) => s + f(r), 0));

  return {
    reports,
    groups: [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([, g]) => g),
    teams: [...teams.values()].sort((a, b) => b.offset - a.offset || b.violations - a.violations || a.team.localeCompare(b.team)),
    totals: { violations: sum((r) => r.violations), preOffset: sum((r) => r.preOffset), recovered: sum((r) => r.recovered), postOffset: sum((r) => r.postOffset), awaiting: sum((r) => r.awaiting), awaitingDisputes: sum((r) => r.awaitingDisputes) },
  };
}

/** "Jun 2026", "Apr 2026 & May 2026", or "Jan 2026 – Jun 2026" for longer selections */
export function periodsLabel(summary: Summary): string {
  const labels = summary.reports.map((r) => r.periodLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return labels.join(" & ");
  return `${labels[0]} – ${labels[labels.length - 1]}`;
}
