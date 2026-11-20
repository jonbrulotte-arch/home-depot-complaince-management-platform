import type { DisputeStatus, IssueSeverity, IssueStatus } from "@prisma/client";

// The Summarizer's Issues report: every issue in a date range with the compliance data on its POs,
// totals and breakdowns, and the earlier issues that saw activity in the range. This file is pure
// (unit-tested); issue-report-data.ts loads the issues, issue-report-pdf.ts writes the PDF.

export interface ReportRange {
  /** YYYY-MM-DD, as in the address */
  fromKey: string;
  toKey: string;
  /** Start of the first day and of the day after the last (UTC; issue dates are UTC dates) */
  start: Date;
  end: Date;
  label: string;
}

/** Longest range a report covers */
export const MAX_REPORT_DAYS = 3 * 366;

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (s: string | undefined) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || isoDay(d) !== s ? null : d;
};

/** "Oct 1 – Oct 31, 2026", "Dec 15, 2025 – Jan 14, 2026" or "Oct 3, 2026" */
export function rangeLabel(start: Date, lastDay: Date): string {
  const fmt = (d: Date, year: boolean) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (isoDay(start) === isoDay(lastDay)) return fmt(start, true);
  const sameYear = start.getUTCFullYear() === lastDay.getUTCFullYear();
  return `${fmt(start, !sameYear)} – ${fmt(lastDay, true)}`;
}

/** The range from ?from=…&to=… (either order), or null when a date is missing, invalid or the range is too long. */
export function parseReportRange(from: string | undefined, to: string | undefined): ReportRange | null {
  let a = parseDay(from);
  let b = parseDay(to);
  if (!a || !b) return null;
  if (a > b) [a, b] = [b, a];
  if ((b.getTime() - a.getTime()) / DAY + 1 > MAX_REPORT_DAYS) return null;
  return { fromKey: isoDay(a), toKey: isoDay(b), start: a, end: new Date(b.getTime() + DAY), label: rangeLabel(a, b) };
}

/** Quick picks for the range, relative to today (in UTC dates). */
export function rangePresets(today: Date): { label: string; from: string; to: string }[] {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const daysAgo = (n: number) => isoDay(new Date(t.getTime() - n * DAY));
  return [
    { label: "Last 7 days", from: daysAgo(6), to: isoDay(t) },
    { label: "Last 30 days", from: daysAgo(29), to: isoDay(t) },
    { label: "This month", from: isoDay(new Date(Date.UTC(y, m, 1))), to: isoDay(t) },
    { label: "Last month", from: isoDay(new Date(Date.UTC(y, m - 1, 1))), to: isoDay(new Date(Date.UTC(y, m, 0))) },
    { label: "Year to date", from: isoDay(new Date(Date.UTC(y, 0, 1))), to: isoDay(t) },
  ];
}

export interface ReportViolation {
  /** "Oct 2026" */
  month: string;
  program: string;
  metric: string;
  offset: number;
  team: string | null;
  disputeStatus: DisputeStatus | null;
  recovered: number;
}

export interface ReportIssue {
  id: string;
  number: number;
  title: string;
  issueDate: Date;
  status: IssueStatus;
  severity: IssueSeverity;
  category: string;
  /** Team name, or null */
  team: string | null;
  program: string | null;
  hdTickets: string[];
  description: string;
  actionsTaken: string | null;
  consequences: string | null;
  resolution: string | null;
  estimatedFine: number | null;
  followUpDate: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  pos: { poNumber: string; estimatedFine: number | null; found: boolean; violations: ReportViolation[] }[];
  notes: { author: string | null; createdAt: Date; body: string }[];
}

const OPEN: IssueStatus[] = ["OPEN", "IN_PROGRESS"];
const WON: DisputeStatus[] = ["APPROVED", "PARTIAL"];
const round = (n: number) => Math.round(n * 100) / 100;
const inRange = (d: Date | null, r: ReportRange) => Boolean(d && d >= r.start && d < r.end);

/** Violations, offsets and recovered on an issue's POs */
export function issueFigures(i: ReportIssue) {
  const v = i.pos.flatMap((p) => p.violations);
  return {
    violations: v.length,
    offsets: round(v.reduce((s, x) => s + x.offset, 0)),
    recovered: round(v.reduce((s, x) => s + (x.disputeStatus && WON.includes(x.disputeStatus) ? x.recovered : 0), 0)),
    posFound: i.pos.filter((p) => p.found).length,
  };
}

export type IssueReport = ReturnType<typeof buildIssueReport>;

export function buildIssueReport(all: ReportIssue[], range: ReportRange) {
  const issues = all.filter((i) => inRange(i.issueDate, range)).sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime() || b.number - a.number);
  const rows = issues.map((i) => ({ ...i, ...issueFigures(i), updates: i.notes.filter((n) => inRange(n.createdAt, range)) }));

  // Issues dated before the range that were logged, updated or resolved during it
  const earlier = all
    .filter((i) => i.issueDate < range.start && (inRange(i.createdAt, range) || inRange(i.resolvedAt, range) || i.notes.some((n) => inRange(n.createdAt, range))))
    .sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime())
    .map((i) => ({ ...i, ...issueFigures(i), updates: i.notes.filter((n) => inRange(n.createdAt, range)), loggedInRange: inRange(i.createdAt, range), resolvedInRange: inRange(i.resolvedAt, range) }));

  const withEstimate = rows.filter((r) => r.estimatedFine !== null);
  const count = (key: (i: (typeof rows)[number]) => string | null, order?: string[]) => {
    const map = new Map<string, { label: string; count: number; open: number; offsets: number; estimated: number }>();
    for (const i of rows) {
      const k = key(i) ?? "Not set";
      const g = map.get(k) ?? { label: k, count: 0, open: 0, offsets: 0, estimated: 0 };
      g.count++;
      if (OPEN.includes(i.status)) g.open++;
      g.offsets += i.offsets;
      g.estimated += i.estimatedFine ?? 0;
      map.set(k, g);
    }
    const out = [...map.values()].map((g) => ({ ...g, offsets: round(g.offsets) }));
    return order ? out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : out.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    range,
    issues: rows,
    earlier,
    totals: {
      issues: rows.length,
      open: rows.filter((i) => OPEN.includes(i.status)).length,
      /** Any issue resolved during the range, whatever its date */
      resolvedInRange: all.filter((i) => inRange(i.resolvedAt, range)).length,
      pos: rows.reduce((s, i) => s + i.pos.length, 0),
      posFound: rows.reduce((s, i) => s + i.posFound, 0),
      violations: rows.reduce((s, i) => s + i.violations, 0),
      offsets: round(rows.reduce((s, i) => s + i.offsets, 0)),
      recovered: round(rows.reduce((s, i) => s + i.recovered, 0)),
      /** Expected vs assessed over the issues with an estimate only */
      estimated: { issues: withEstimate.length, expected: withEstimate.reduce((s, i) => s + (i.estimatedFine ?? 0), 0), assessed: round(withEstimate.reduce((s, i) => s + i.offsets, 0)) },
      updates: rows.reduce((s, i) => s + i.updates.length, 0) + earlier.reduce((s, i) => s + i.updates.length, 0),
    },
    byCategory: count((i) => i.category),
    byTeam: count((i) => i.team),
    bySeverity: count((i) => i.severity, ["HIGH", "MEDIUM", "LOW"]),
    byStatus: count((i) => i.status, ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  };
}
