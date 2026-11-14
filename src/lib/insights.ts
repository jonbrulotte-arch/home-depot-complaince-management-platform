import type { DisputeStatus, Disposition, IssueSeverity, IssueStatus } from "@prisma/client";
import { fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";

// Reports & Insights (/insights): pure aggregation over compliance lines, published scorecards and
// the Issue Log for a chosen time frame and program. insights-data.ts loads the rows; this file
// only counts, so it is unit-tested without a database.
//
// Terms used throughout:
// - a violation is a non-compliant line whose review isn't Cancelled / Resolved (as on scorecards);
// - offsets are THD's charges on violations (pre-dispute);
// - recovered is what approved or partly approved disputes won back;
// - net is offsets minus recovered (what the chargebacks cost after disputes).

export type InsightTab = "overview" | "programs" | "time" | "teams" | "issues" | "disputes" | "locations";

export const INSIGHT_TABS: { key: InsightTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "programs", label: "Programs" },
  { key: "time", label: "Time" },
  { key: "teams", label: "Teams" },
  { key: "issues", label: "Issues" },
  { key: "disputes", label: "Disputes" },
  { key: "locations", label: "Locations & carriers" },
];

export const isInsightTab = (v: string | undefined): v is InsightTab => INSIGHT_TABS.some((t) => t.key === v);

// ─── Time frame ──────────────────────────────────────────────────

export type RangeKey = "3" | "6" | "12" | "fytd" | "pfy" | "all" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "3", label: "Last 3 months" },
  { key: "6", label: "Last 6 months" },
  { key: "12", label: "Last 12 months" },
  { key: "fytd", label: "Fiscal year to date" },
  { key: "pfy", label: "Previous fiscal year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

export interface TimeFrame {
  key: RangeKey;
  from: number;
  to: number;
  /** Every month in the frame, oldest first */
  months: number[];
  label: string;
}

/** Fiscal months from `from` to `to`, inclusive. */
export function monthsBetween(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; m <= to && out.length < 600; m = shiftFiscalMonth(m, 1)) out.push(m);
  return out;
}

/**
 * The months a range covers, ending at the latest month with data (or the custom months given).
 * Fiscal years run February to January (FM01 to FM12).
 */
export function resolveTimeFrame(key: string | undefined, latest: number | null, earliest: number | null, custom: { from?: string; to?: string } = {}): TimeFrame {
  const last = latest ?? 0;
  const first = earliest ?? last;
  const k: RangeKey = RANGE_OPTIONS.some((o) => o.key === key) ? (key as RangeKey) : "12";
  let from = last;
  let to = last;
  if (k === "3" || k === "6" || k === "12") from = shiftFiscalMonth(last, -(Number(k) - 1));
  else if (k === "fytd") from = Math.floor(last / 100) * 100 + 1;
  else if (k === "pfy") {
    from = (Math.floor(last / 100) - 1) * 100 + 1;
    to = (Math.floor(last / 100) - 1) * 100 + 12;
  } else if (k === "all") from = first;
  else {
    const f = Number(custom.from);
    const t = Number(custom.to);
    from = validMonth(f) ? f : shiftFiscalMonth(last, -11);
    to = validMonth(t) ? t : last;
    if (from > to) [from, to] = [to, from];
    // Within the months there is anything for (the pickers offer only those)
    from = Math.min(Math.max(from, first), last);
    to = Math.min(Math.max(to, first), last);
  }
  if (!last) return { key: k, from: 0, to: 0, months: [], label: "No data yet" };
  const months = monthsBetween(from, to);
  return { key: k, from, to, months, label: from === to ? fiscalLabel(from) : `${fiscalLabel(from)} – ${fiscalLabel(to)}` };
}

const validMonth = (m: number) => Number.isInteger(m) && m % 100 >= 1 && m % 100 <= 12 && m > 200000 && m < 210000;

/** The same number of months just before a frame, for comparison. */
export function previousFrame(frame: TimeFrame): { from: number; to: number } | null {
  if (!frame.months.length) return null;
  return { from: shiftFiscalMonth(frame.from, -frame.months.length), to: shiftFiscalMonth(frame.from, -1) };
}

/** The same months one fiscal year earlier. */
export function priorYearFrame(frame: TimeFrame): { from: number; to: number } | null {
  if (!frame.months.length) return null;
  return { from: shiftFiscalMonth(frame.from, -12), to: shiftFiscalMonth(frame.to, -12) };
}

export type MonthWindow = { from: number; to: number };

export const windowLabel = (w: MonthWindow | null) => (!w ? "" : w.from === w.to ? fiscalLabel(w.from) : `${fiscalLabel(w.from)} – ${fiscalLabel(w.to)}`);

/**
 * The windows the time frame is compared over. THD's data runs behind the frame's end (the frame
 * reaches the latest logged issue), and months it hasn't reported yet would count as zero, so the
 * comparison covers only the frame's months up to the last month with compliance data
 * (`current`), against the same months of the previous period (`previous`, the same number of
 * months just before the frame) and of the year before (`priorYear`). A comparison window that
 * starts before the first month with data is left out (null): it would be compared with nothing.
 */
export function comparisonWindows(frame: TimeFrame, dataFirst: number | null, dataLast: number | null): { current: MonthWindow | null; previous: MonthWindow | null; priorYear: MonthWindow | null } {
  const none = { current: null, previous: null, priorYear: null };
  if (!frame.months.length || dataFirst === null || dataLast === null) return none;
  const coveredTo = Math.min(frame.to, dataLast);
  if (coveredTo < frame.from) return none;
  const covered = monthsBetween(frame.from, coveredTo).length;
  const prevFrom = shiftFiscalMonth(frame.from, -frame.months.length);
  const yearFrom = shiftFiscalMonth(frame.from, -12);
  return {
    current: { from: frame.from, to: coveredTo },
    previous: prevFrom >= dataFirst ? { from: prevFrom, to: shiftFiscalMonth(prevFrom, covered - 1) } : null,
    priorYear: yearFrom >= dataFirst ? { from: yearFrom, to: shiftFiscalMonth(coveredTo, -12) } : null,
  };
}

/** "FY2026 Q3" for a fiscal month (Q1 = Feb–Apr). */
export function fiscalQuarter(month: number): string {
  return `FY${Math.floor(month / 100)} Q${Math.ceil((month % 100) / 3)}`;
}

// ─── Compliance lines ───────────────────────────────────────────

export interface InsightLine {
  id: string;
  /** The report month the line belongs to (month received or THD fiscal month, per Settings) */
  month: number;
  programCode: string;
  programName: string;
  metricCode: string;
  metricName: string;
  isCompliant: boolean;
  offset: number;
  disposition: Disposition | null;
  /** Name of the team responsible (Admin › Teams), or null when not set */
  team: string | null;
  rootCause: string | null;
  dcNumber: string | null;
  carrier: string | null;
  sku: string | null;
  skuDescription: string | null;
  poNumber: string | null;
  poRecordId: string | null;
  dispute: { status: DisputeStatus; disputed: number; recovered: number | null; reasonCode: string | null; submittedAt: Date | null; decidedAt: Date | null } | null;
  hasFeedback: boolean;
}

export const isViolation = (l: InsightLine) => !l.isCompliant && l.disposition !== "RESOLVED";
const WON: DisputeStatus[] = ["APPROVED", "PARTIAL"];
const DECIDED: DisputeStatus[] = ["APPROVED", "PARTIAL", "DENIED"];
const OPEN_DISPUTE: DisputeStatus[] = ["PREPARING", "READY", "SUBMITTED"];
export const recoveredOf = (l: InsightLine) => (l.dispute && WON.includes(l.dispute.status) ? (l.dispute.recovered ?? 0) : 0);

export interface Figures {
  lines: number;
  violations: number;
  offsets: number;
  recovered: number;
  net: number;
  /** Violations still awaiting review (decision Pending or none) */
  unreviewed: number;
  /** Violations with a dispute in any status */
  disputed: number;
  /** Disputes approved or partly approved */
  won: number;
  /** Disputes with THD's decision recorded (approved, partly approved or denied) */
  decided: number;
  /** Disputed amount still awaiting THD (submitted) */
  awaiting: number;
  /** Violations with warehouse or other feedback on a published scorecard */
  withFeedback: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function figures(lines: InsightLine[]): Figures {
  const f: Figures = { lines: lines.length, violations: 0, offsets: 0, recovered: 0, net: 0, unreviewed: 0, disputed: 0, won: 0, decided: 0, awaiting: 0, withFeedback: 0 };
  for (const l of lines) {
    if (!isViolation(l)) continue;
    f.violations++;
    f.offsets += l.offset;
    f.recovered += recoveredOf(l);
    if (!l.disposition || l.disposition === "PENDING") f.unreviewed++;
    if (l.hasFeedback) f.withFeedback++;
    if (l.dispute && l.dispute.status !== "WITHDRAWN") {
      f.disputed++;
      if (WON.includes(l.dispute.status)) f.won++;
      if (DECIDED.includes(l.dispute.status)) f.decided++;
      if (l.dispute.status === "SUBMITTED") f.awaiting += l.dispute.disputed;
    }
  }
  f.offsets = round(f.offsets);
  f.recovered = round(f.recovered);
  f.awaiting = round(f.awaiting);
  f.net = round(f.offsets - f.recovered);
  return f;
}

/** Share of decided disputes THD approved (fully or partly), or null with none decided. */
export const winRate = (f: Pick<Figures, "won" | "decided">) => (f.decided ? (f.won / f.decided) * 100 : null);
/** Percentage change from `before` to `now`, or null when there's nothing to compare with. */
export const changePct = (now: number, before: number) => (before ? ((now - before) / before) * 100 : null);

export interface GroupRow extends Figures {
  key: string;
  label: string;
  /** This group's share of all offsets in the set, 0–100 */
  share: number;
}

/** Figures per group (violations only count; groups without violations are left out), largest offsets first. */
export function groupBy(lines: InsightLine[], key: (l: InsightLine) => string | null, label: (k: string, l: InsightLine) => string = (k) => k): GroupRow[] {
  const groups = new Map<string, { label: string; lines: InsightLine[] }>();
  for (const l of lines) {
    if (!isViolation(l)) continue;
    const k = key(l) ?? "";
    const g = groups.get(k) ?? { label: k ? label(k, l) : "Not set", lines: [] };
    g.lines.push(l);
    groups.set(k, g);
  }
  const total = lines.filter(isViolation).reduce((s, l) => s + l.offset, 0);
  return [...groups.entries()]
    .map(([k, g]) => {
      const f = figures(g.lines);
      return { key: k, label: g.label, ...f, share: total ? (f.offsets / total) * 100 : 0 };
    })
    .sort((a, b) => b.offsets - a.offsets || b.violations - a.violations || a.label.localeCompare(b.label));
}


/** Month-by-month figures for every month in the frame (months without violations included), newest month first. */
export function byMonth(lines: InsightLine[], months: number[]): ({ month: number; label: string; quarter: string } & Figures)[] {
  const per = new Map<number, InsightLine[]>(months.map((m) => [m, []]));
  for (const l of lines) per.get(l.month)?.push(l);
  return [...months].sort((a, b) => b - a).map((m) => ({ month: m, label: fiscalLabel(m), quarter: fiscalQuarter(m), ...figures(per.get(m) ?? []) }));
}

/** Figures per fiscal quarter of the months given, newest quarter first. */
export function byQuarter(lines: InsightLine[], months: number[]): ({ label: string } & Figures)[] {
  const quarters = [...new Set([...months].sort((a, b) => b - a).map(fiscalQuarter))];
  return quarters.map((q) => ({ label: q, ...figures(lines.filter((l) => months.includes(l.month) && fiscalQuarter(l.month) === q)) }));
}

/** Rows × months grid of offsets (and violation counts) for the groups given. */
export function monthGrid(lines: InsightLine[], months: number[], key: (l: InsightLine) => string | null, rows: { key: string; label: string }[]) {
  return rows.map((r) => {
    const mine = lines.filter((l) => isViolation(l) && (key(l) ?? "") === r.key);
    return { ...r, cells: months.map((m) => figures(mine.filter((l) => l.month === m))) };
  });
}

/** Rows × columns grid of figures, e.g. team × program; rows and columns largest offsets first. */
export function crossTab(
  lines: InsightLine[],
  row: { key: (l: InsightLine) => string | null; label: (k: string, l: InsightLine) => string },
  col: { key: (l: InsightLine) => string | null; label: (k: string, l: InsightLine) => string },
) {
  const v = lines.filter(isViolation);
  return {
    rows: groupBy(v, row.key, row.label),
    cols: groupBy(v, col.key, col.label),
    cell: (r: string, c: string) => figures(v.filter((l) => (row.key(l) ?? "") === r && (col.key(l) ?? "") === c)),
  };
}

export const teamKey = (l: InsightLine) => l.team;
export const programKey = (l: InsightLine) => l.programCode;
export const metricKey = (l: InsightLine) => `${l.programCode}|${l.metricCode}`;

/** Root causes as written by analysts, grouped case-insensitively, most common first. */
export function rootCauses(lines: InsightLine[], limit = 15): { cause: string; violations: number; offsets: number; teams: string[] }[] {
  const map = new Map<string, { cause: string; violations: number; offsets: number; teams: Set<string> }>();
  for (const l of lines) {
    if (!isViolation(l) || !l.rootCause?.trim()) continue;
    const k = l.rootCause.trim().toLowerCase().replace(/\s+/g, " ");
    const g = map.get(k) ?? { cause: l.rootCause.trim(), violations: 0, offsets: 0, teams: new Set<string>() };
    g.violations++;
    g.offsets += l.offset;
    if (l.team) g.teams.add(l.team);
    map.set(k, g);
  }
  return [...map.values()]
    .map((g) => ({ cause: g.cause, violations: g.violations, offsets: round(g.offsets), teams: [...g.teams] }))
    .sort((a, b) => b.violations - a.violations || b.offsets - a.offsets)
    .slice(0, limit);
}

/** POs with more than one violation in the frame, most violations first. */
export function repeatPos(lines: InsightLine[], limit = 20) {
  const map = new Map<string, { poNumber: string; poRecordId: string | null; violations: number; offsets: number; metrics: Set<string>; months: Set<number> }>();
  for (const l of lines) {
    if (!isViolation(l) || !l.poNumber) continue;
    const k = l.poRecordId ?? l.poNumber;
    const g = map.get(k) ?? { poNumber: l.poNumber, poRecordId: l.poRecordId, violations: 0, offsets: 0, metrics: new Set<string>(), months: new Set<number>() };
    g.violations++;
    g.offsets += l.offset;
    g.metrics.add(l.metricName);
    g.months.add(l.month);
    map.set(k, g);
  }
  return [...map.values()]
    .filter((g) => g.violations > 1)
    .map((g) => ({ poNumber: g.poNumber, poRecordId: g.poRecordId, violations: g.violations, offsets: round(g.offsets), metrics: [...g.metrics], months: [...g.months].sort().map(fiscalLabel) }))
    .sort((a, b) => b.violations - a.violations || b.offsets - a.offsets)
    .slice(0, limit);
}

/** Dispute pipeline: count and amount by status. */
export function disputePipeline(lines: InsightLine[]) {
  const order: DisputeStatus[] = ["PREPARING", "READY", "SUBMITTED", "APPROVED", "PARTIAL", "DENIED", "WITHDRAWN"];
  return order.map((status) => {
    const ds = lines.filter((l) => isViolation(l) && l.dispute?.status === status);
    return { status, count: ds.length, disputed: round(ds.reduce((s, l) => s + (l.dispute?.disputed ?? 0), 0)), recovered: round(ds.reduce((s, l) => s + recoveredOf(l), 0)) };
  });
}

/** Average days from submitting a dispute to THD's decision, over decided disputes with both dates. */
export function averageDecisionDays(lines: InsightLine[]): number | null {
  const days = lines
    .filter((l) => isViolation(l) && l.dispute && DECIDED.includes(l.dispute.status) && l.dispute.submittedAt && l.dispute.decidedAt)
    .map((l) => (l.dispute!.decidedAt!.getTime() - l.dispute!.submittedAt!.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  return days.length ? days.reduce((s, d) => s + d, 0) / days.length : null;
}

/** Violations reviewed as Disputable or Accepted but never disputed, and still-open disputes, for follow-up. */
export function disputeGaps(lines: InsightLine[]) {
  const v = lines.filter(isViolation);
  const notDisputed = v.filter((l) => l.disposition === "DISPUTABLE" && !l.dispute);
  const open = v.filter((l) => l.dispute && OPEN_DISPUTE.includes(l.dispute.status));
  return {
    disputableNotDisputed: { count: notDisputed.length, offsets: round(notDisputed.reduce((s, l) => s + l.offset, 0)) },
    open: { count: open.length, disputed: round(open.reduce((s, l) => s + (l.dispute?.disputed ?? 0), 0)) },
  };
}

// ─── Published scorecards: performance against goal ───────────────

export interface GoalSnapshot {
  month: number;
  programs: { code: string; name: string; metrics: { code: string; name: string; goalPct: number | null; prePct: number | null; postPct: number | null; meetsGoal: boolean | null; postOffset: number }[] }[];
}

/** Per program and metric: post-dispute % for each month with a published scorecard, and how often the goal was met. */
export function goalPerformance(snapshots: GoalSnapshot[], months: number[], programCode?: string) {
  const inFrame = snapshots.filter((s) => months.includes(s.month)).sort((a, b) => a.month - b.month);
  const shown = inFrame.map((s) => s.month);
  const programs = new Map<string, { code: string; name: string; metrics: Map<string, { code: string; name: string; goalPct: number | null; cells: Map<number, { pct: number | null; meets: boolean | null }> }> }>();
  for (const s of inFrame) {
    for (const p of s.programs) {
      if (programCode && p.code !== programCode) continue;
      const prog = programs.get(p.code) ?? { code: p.code, name: p.name, metrics: new Map() };
      for (const m of p.metrics) {
        const met = prog.metrics.get(m.code) ?? { code: m.code, name: m.name, goalPct: m.goalPct, cells: new Map() };
        met.goalPct = m.goalPct ?? met.goalPct;
        met.cells.set(s.month, { pct: m.postPct, meets: m.meetsGoal });
        prog.metrics.set(m.code, met);
      }
      programs.set(p.code, prog);
    }
  }
  return {
    months: shown,
    programs: [...programs.values()].map((p) => ({
      code: p.code,
      name: p.name,
      metrics: [...p.metrics.values()].map((m) => {
        const judged = [...m.cells.values()].filter((c) => c.meets !== null);
        return {
          code: m.code,
          name: m.name,
          goalPct: m.goalPct,
          cells: shown.map((month) => m.cells.get(month) ?? null),
          met: judged.filter((c) => c.meets).length,
          judged: judged.length,
        };
      }),
    })),
  };
}

// ─── Issue Log ───────────────────────────────────────────────────

export interface InsightIssue {
  id: string;
  number: number;
  title: string;
  issueDate: Date;
  status: IssueStatus;
  severity: IssueSeverity;
  category: string;
  /** Name of the team responsible, or null */
  team: string | null;
  programCode: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  followUpDate: Date | null;
  poCount: number;
  /** POs found in the compliance data so far */
  posFound: number;
  /** Most THD could charge, as estimated on the issue (whole dollars), or null */
  estimatedFine: number | null;
  /** Violations and offsets on the issue's POs, from the compliance data */
  violations: number;
  offsets: number;
}

const OPEN_ISSUE: IssueStatus[] = ["OPEN", "IN_PROGRESS"];

/**
 * Expected fines (the estimates on issues) against assessed fines (THD's offsets on the issues'
 * POs so far). Only issues with an estimate count towards the comparison's totals, so an issue
 * logged without one doesn't make the estimates look low.
 */
export function expectedVsAssessed(issues: InsightIssue[]) {
  const withEstimate = issues.filter((i) => i.estimatedFine !== null);
  const expected = withEstimate.reduce((s, i) => s + (i.estimatedFine ?? 0), 0);
  const assessed = round(withEstimate.reduce((s, i) => s + i.offsets, 0));
  return {
    estimated: { issues: withEstimate.length, expected, assessed, difference: round(assessed - expected) },
    fineRows: [...issues]
      .filter((i) => i.estimatedFine !== null || i.offsets > 0)
      .sort((a, b) => (b.estimatedFine ?? 0) - (a.estimatedFine ?? 0) || b.offsets - a.offsets),
  };
}

export function issueInsights(issues: InsightIssue[], months: number[], monthOf: (d: Date) => number, now = new Date()) {
  const inFrame = issues.filter((i) => months.includes(monthOf(i.issueDate)));
  const count = <K extends string>(key: (i: InsightIssue) => K | null, labelOf: (k: K) => string = (k) => k) => {
    const map = new Map<string, { key: string; label: string; count: number; open: number; offsets: number; estimated: number }>();
    for (const i of inFrame) {
      const k = key(i) ?? "";
      const g = map.get(k) ?? { key: k, label: k ? labelOf(k as K) : "Not set", count: 0, open: 0, offsets: 0, estimated: 0 };
      g.count++;
      if (OPEN_ISSUE.includes(i.status)) g.open++;
      g.offsets += i.offsets;
      g.estimated += i.estimatedFine ?? 0;
      map.set(k, g);
    }
    return [...map.values()].map((g) => ({ ...g, offsets: round(g.offsets) })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const resolvedDays = inFrame
    .filter((i) => i.resolvedAt)
    .map((i) => (i.resolvedAt!.getTime() - i.issueDate.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const open = issues.filter((i) => OPEN_ISSUE.includes(i.status));
  const age = (i: InsightIssue) => (now.getTime() - i.issueDate.getTime()) / 86_400_000;
  const aging = [
    { label: "0–7 days", count: open.filter((i) => age(i) <= 7).length },
    { label: "8–30 days", count: open.filter((i) => age(i) > 7 && age(i) <= 30).length },
    { label: "31–90 days", count: open.filter((i) => age(i) > 30 && age(i) <= 90).length },
    { label: "Over 90 days", count: open.filter((i) => age(i) > 90).length },
  ];
  const overdue = open
    .filter((i) => i.followUpDate && i.followUpDate.getTime() < now.getTime() - 86_400_000)
    .sort((a, b) => a.followUpDate!.getTime() - b.followUpDate!.getTime());
  return {
    total: inFrame.length,
    open: inFrame.filter((i) => OPEN_ISSUE.includes(i.status)).length,
    withViolations: inFrame.filter((i) => i.violations > 0).length,
    linkedOffsets: round(inFrame.reduce((s, i) => s + i.offsets, 0)),
    ...expectedVsAssessed(inFrame),
    avgDaysToResolve: resolvedDays.length ? resolvedDays.reduce((s, d) => s + d, 0) / resolvedDays.length : null,
    byStatus: count((i) => i.status),
    byCategory: count((i) => i.category),
    bySeverity: count((i) => i.severity),
    byTeam: count((i) => i.team),
    byMonth: [...months].sort((a, b) => b - a).map((m) => ({ month: m, label: fiscalLabel(m), count: inFrame.filter((i) => monthOf(i.issueDate) === m).length })),
    aging,
    overdue,
    costliest: [...inFrame].filter((i) => i.offsets > 0).sort((a, b) => b.offsets - a.offsets).slice(0, 10),
  };
}
