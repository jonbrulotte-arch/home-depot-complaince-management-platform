import Link from "next/link";
import { fiscalLabel } from "@/lib/fiscal";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import {
  averageDecisionDays,
  byMonth,
  byQuarter,
  changePct,
  crossTab,
  disputeGaps,
  disputePipeline,
  figures,
  goalPerformance,
  groupBy,
  isViolation,
  issueInsights,
  metricKey,
  monthGrid,
  programKey,
  repeatPos,
  rootCauses,
  teamKey,
  windowLabel,
  winRate,
  type Figures,
  type GroupRow,
} from "@/lib/insights";
import { fiscalMonthOf, type Insights } from "@/lib/insights-data";
import { cn, formatUtcDate } from "@/lib/utils";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { Change, Section, Table, dollars, money, n, pct, signedMoney, type Col } from "./ui";

// The tabs of Reports & Insights. Each takes the loaded data and what the viewer may open.

export interface Access {
  /** PO numbers link to their PO records */
  poLookup: boolean;
  /** Issue numbers link to their issues */
  issues: boolean;
}

const compareLabel = windowLabel;

/** Whether the comparisons stop before the frame's last month (THD hasn't reported the rest yet) */
const comparedShort = (data: Insights) => Boolean(data.compared && data.compared.to < data.frame.to);
/** "Dec 2025 – Sep 2026 (the months with THD data so far)" or the frame's own label */
const comparedLabel = (data: Insights) => (comparedShort(data) ? `${compareLabel(data.compared)} (the months with THD data so far)` : data.frame.label);
/** A month THD hasn't reported yet: its zeros mean "not known yet", not "no violations" */
const notReported = (data: Insights, month: number) => data.complianceLatest === null || month > data.complianceLatest;
function MonthLabel({ data, month, label }: { data: Insights; month: number; label: string }) {
  return (
    <span className="text-gray-900">
      {label}
      {notReported(data, month) && <span className="ml-2 text-xs text-gray-400">No THD data yet</span>}
    </span>
  );
}

function figureCols<R extends Figures>(): Col<R>[] {
  return [
    { header: "Violations", cell: (r) => n(r.violations), align: "right" },
    { header: "Offsets", cell: (r) => money(r.offsets), align: "right" },
    { header: "Recovered", cell: (r) => (r.recovered ? <span className="text-green-700">{money(r.recovered)}</span> : "—"), align: "right" },
    { header: "Net", cell: (r) => <span className="font-medium text-gray-900">{money(r.net)}</span>, align: "right" },
  ];
}
const shareCol = <R extends GroupRow>(): Col<R> => ({ header: "Share", cell: (r) => pct(r.share, 0), align: "right" });
const footFigures = (f: Figures) => [n(f.violations), money(f.offsets), money(f.recovered), money(f.net)];

function PoLink({ po, recordId, access }: { po: string; recordId: string | null; access: Access }) {
  return recordId && access.poLookup ? (
    <Link href={`/po/${recordId}`} className="text-blue-600 hover:underline">
      {po}
    </Link>
  ) : (
    <>{po}</>
  );
}

// ─── Overview ────────────────────────────────────────────────────

export function OverviewTab({ data }: { data: Insights }) {
  const now = figures(data.lines);
  const before = data.previous ? figures(data.previous.lines) : null;
  const months = byMonth(data.lines, data.frame.months);
  const metrics = groupBy(data.lines, metricKey, (_k, l) => `${l.programName} · ${l.metricName}`);
  const teams = groupBy(data.lines, teamKey, (k) => k);
  const issues = issueInsights(data.issues, data.frame.months, fiscalMonthOf);
  // "−64% vs Dec 2024 – Nov 2025": this frame's figure against the previous period's
  const vs = before ? `vs ${compareLabel(data.previous)}` : undefined;

  return (
    <div className="space-y-6">
      <StatTiles
        stats={[
          { label: "Violations", value: n(now.violations), hint: before ? `${fmtChange(changePct(now.violations, before.violations))} ${vs}` : undefined },
          { label: "Offsets", value: money(now.offsets), hint: before ? `${fmtChange(changePct(now.offsets, before.offsets))} ${vs}` : undefined },
          { label: "Recovered in disputes", value: money(now.recovered), tone: now.recovered ? "text-green-700" : undefined },
          { label: "Net (offsets − recovered)", value: money(now.net), tone: now.net ? "text-red-700" : undefined },
          { label: "Dispute win rate", value: pct(winRate(now), 0), hint: `${n(now.won)} of ${n(now.decided)} decided` },
          { label: "Open issues", value: n(issues.open), hint: `${n(issues.total)} logged in the time frame` },
        ]}
      />
      <Highlights data={data} now={now} before={before} metrics={metrics} teams={teams} overdue={issues.overdue.length} />
      <Section title="Month by month" description="Violations and offsets in each month of the time frame, newest first.">
        <Table
          rows={months}
          cols={[{ header: "Month", cell: (r) => <MonthLabel data={data} month={r.month} label={r.label} /> }, ...figureCols<(typeof months)[number]>()]}
          bar={{ header: "Offsets", value: (r) => r.offsets }}
          foot={["Total", ...footFigures(now)]}
        />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Costliest compliance types" description="Program and metric, largest offsets first.">
          <Table rows={metrics.slice(0, 8)} cols={[{ header: "Program · Metric", cell: (r) => <span className="text-gray-900">{r.label}</span> }, { header: "Violations", cell: (r) => n(r.violations), align: "right" }, { header: "Offsets", cell: (r) => money(r.offsets), align: "right" }, shareCol()]} />
        </Section>
        <Section title="By team responsible" description="From the analysts' review of each violation.">
          <Table rows={teams.slice(0, 8)} cols={[{ header: "Team", cell: (r) => <span className="text-gray-900">{r.label}</span> }, { header: "Violations", cell: (r) => n(r.violations), align: "right" }, { header: "Offsets", cell: (r) => money(r.offsets), align: "right" }, shareCol()]} />
        </Section>
      </div>
    </div>
  );
}

const fmtChange = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}%`);

function Highlights({ data, now, before, metrics, teams, overdue }: { data: Insights; now: Figures; before: Figures | null; metrics: GroupRow[]; teams: GroupRow[]; overdue: number }) {
  const items: string[] = [];
  if (!now.violations) items.push("No violations in this time frame.");
  if (before && now.violations) {
    const c = changePct(now.offsets, before.offsets);
    if (c !== null)
      items.push(
        `Offsets ${c >= 0 ? "rose" : "fell"} ${Math.abs(Math.round(c))}%: ${money(now.offsets)} in ${comparedLabel(data)}, ${c >= 0 ? "up" : "down"} from ${money(before.offsets)} in the previous period, ${compareLabel(data.previous)}.`,
      );
  }
  if (metrics[0]) items.push(`${metrics[0].label} is the costliest compliance type: ${money(metrics[0].offsets)}, ${pct(metrics[0].share, 0)} of all offsets.`);
  if (before) {
    const prevMetrics = new Map(groupBy(data.previous!.lines, metricKey).map((r) => [r.key, r.offsets]));
    const rises = metrics.map((m) => ({ m, rise: m.offsets - (prevMetrics.get(m.key) ?? 0) })).filter((x) => x.rise > 0).sort((a, b) => b.rise - a.rise);
    if (rises[0]) items.push(`The biggest increase is ${rises[0].m.label}: up ${money(rises[0].rise)} on the previous period (${compareLabel(data.previous)}).`);
  }
  const team = teams.find((t) => t.key);
  if (team) items.push(`${team.label} accounts for the most offsets among teams (${money(team.offsets)}, ${n(team.violations)} violation(s)).`);
  if (now.decided) items.push(`THD approved ${n(now.won)} of ${n(now.decided)} decided dispute(s) (${pct(winRate(now), 0)}), recovering ${money(now.recovered)}.`);
  if (now.awaiting) items.push(`${money(now.awaiting)} in disputes is awaiting THD's decision.`);
  if (now.unreviewed) items.push(`${n(now.unreviewed)} violation(s) haven't been reviewed yet, so their team and root cause are still unknown.`);
  if (now.violations) items.push(`Feedback was given on ${n(now.withFeedback)} of ${n(now.violations)} violation(s) (${pct((now.withFeedback / now.violations) * 100, 0)}).`);
  if (overdue) items.push(`${n(overdue)} open issue(s) are past their follow-up date.`);
  if (comparedShort(data) && data.complianceLatest)
    items.push(`THD's data runs to ${fiscalLabel(data.complianceLatest)} so far; the months after it have no compliance data yet and are left out of the comparisons.`);
  return (
    <Section title="Highlights">
      <ul className="list-disc space-y-1.5 px-10 pb-6 text-sm text-gray-700">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Programs ────────────────────────────────────────────────────

export function ProgramsTab({ data }: { data: Insights }) {
  const programs = groupBy(data.lines, programKey, (_k, l) => l.programName);
  const prev = new Map(groupBy(data.previous?.lines ?? [], metricKey).map((r) => [r.key, r]));
  const metrics = groupBy(data.lines, metricKey, (_k, l) => `${l.programName} · ${l.metricName}`);
  const goals = goalPerformance(data.goalSnapshots, data.frame.months, data.programCode);
  const total = figures(data.lines);

  return (
    <div className="space-y-6">
      <Section title="By program">
        <Table
          rows={programs}
          cols={[
            { header: "Program", cell: (r) => <span className="font-medium text-gray-900">{r.label}</span> },
            ...figureCols<GroupRow>(),
            { header: "Disputed", cell: (r) => n(r.disputed), align: "right" },
            { header: "Win rate", cell: (r) => pct(winRate(r), 0), align: "right" },
            shareCol(),
          ]}
          bar={{ header: "Offsets", value: (r) => r.offsets }}
          foot={["Total", ...footFigures(total), n(total.disputed), pct(winRate(total), 0), "100%"]}
        />
      </Section>
      <Section title="By compliance type" description={data.previous ? `Change compared with ${compareLabel(data.previous)}.` : undefined}>
        <Table
          rows={metrics}
          cols={[
            { header: "Program · Metric", cell: (r) => <span className="text-gray-900">{r.label}</span> },
            ...figureCols<GroupRow>(),
            { header: "Offsets change", cell: (r) => <Change value={changePct(r.offsets, prev.get(r.key)?.offsets ?? 0)} />, align: "right" },
            { header: "Win rate", cell: (r) => pct(winRate(r), 0), align: "right" },
          ]}
        />
      </Section>
      <Section
        title="Performance against goal"
        description="Post-dispute compliance from each month's published scorecard. Green met THD's goal, red missed it. Met or Missed without a percentage means THD's export gave no line count for that month."
      >
        {goals.months.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-gray-400">No published scorecards in this time frame.</p>
        ) : (
          <div className="space-y-6 pb-4">
            {goals.programs.map((p) => (
              <div key={p.code}>
                <p className="px-6 pb-2 text-sm font-semibold text-gray-900">{p.name}</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Metric</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Goal</th>
                        {goals.months.map((m) => (
                          <th key={m} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                            {fiscalLabel(m)}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">Met goal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.metrics.map((m) => (
                        <tr key={m.code} className="border-t border-gray-200">
                          <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{m.name}</td>
                          <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{m.goalPct === null ? "—" : `${m.goalPct}%`}</td>
                          {m.cells.map((c, i) => (
                            <td
                              key={i}
                              className={cn(
                                "px-3 py-2 text-right tabular-nums whitespace-nowrap",
                                c?.meets === true ? "text-green-700" : c?.meets === false ? "font-medium text-red-700" : "text-gray-400",
                              )}
                            >
                              {/* No percentage when the export gave no line count; the scorecard still judged the goal */}
                              {!c ? "—" : c.pct !== null ? pct(c.pct) : c.meets === true ? "Met" : c.meets === false ? "Missed" : "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{m.judged ? `${m.met} of ${m.judged}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Time ────────────────────────────────────────────────────────

export function TimeTab({ data }: { data: Insights }) {
  const months = byMonth(data.lines, data.frame.months);
  const quarters = byQuarter(data.lines, data.frame.months);
  const now = figures(data.lines);
  const compare = [
    { label: comparedShort(data) ? `This time frame, months with THD data so far (${compareLabel(data.compared)})` : `This time frame (${data.frame.label})`, ...now },
    ...(data.previous ? [{ label: `Previous period (${compareLabel(data.previous)})`, ...figures(data.previous.lines) }] : []),
    ...(data.priorYear ? [{ label: `Same months last year (${compareLabel(data.priorYear)})`, ...figures(data.priorYear.lines) }] : []),
  ];

  return (
    <div className="space-y-6">
      <Section
        title="Compared with earlier periods"
        description={`The previous period is the same number of months just before this time frame; the same months last year are a year earlier.${comparedShort(data) ? " Only the months THD has reported so far are compared." : ""}`}
      >
        <Table
          rows={compare}
          cols={[
            { header: "Period", cell: (r) => <span className="text-gray-900">{r.label}</span> },
            ...figureCols<(typeof compare)[number]>(),
            { header: "This frame's offsets vs it", cell: (r) => (r === compare[0] ? "—" : <Change value={changePct(now.offsets, r.offsets)} />), align: "right" },
          ]}
        />
      </Section>
      <Section title="Month by month" description="Newest month first; the change is against the month before.">
        <Table
          rows={months}
          cols={[
            { header: "Month", cell: (r) => <MonthLabel data={data} month={r.month} label={r.label} /> },
            { header: "Quarter", cell: (r) => r.quarter },
            ...figureCols<(typeof months)[number]>(),
            { header: "Offsets change", cell: (r) => { const i = months.indexOf(r); return i < months.length - 1 && !notReported(data, r.month) ? <Change value={changePct(r.offsets, months[i + 1].offsets)} /> : "—"; }, align: "right" },
            { header: "Win rate", cell: (r) => pct(winRate(r), 0), align: "right" },
          ]}
          bar={{ header: "Offsets", value: (r) => r.offsets }}
        />
      </Section>
      <Section title="By fiscal quarter" description="Newest first. THD's fiscal year starts in February (Q1 = Feb–Apr).">
        <Table rows={quarters} cols={[{ header: "Quarter", cell: (r) => <span className="text-gray-900">{r.label}</span> }, ...figureCols<(typeof quarters)[number]>()]} bar={{ header: "Offsets", value: (r) => r.offsets }} />
      </Section>
    </div>
  );
}

// ─── Teams ───────────────────────────────────────────────────────

export function TeamsTab({ data }: { data: Insights }) {
  const teams = groupBy(data.lines, teamKey, (k) => k);
  const grid = monthGrid(data.lines, data.frame.months, teamKey, teams.map((t) => ({ key: t.key, label: t.label })));
  const cross = crossTab(data.lines, { key: teamKey, label: (k) => k }, { key: programKey, label: (_k, l) => l.programName });
  const causes = rootCauses(data.lines);
  const total = figures(data.lines);

  return (
    <div className="space-y-6">
      <Section title="By team responsible" description="“Not set” is violations not reviewed yet, or reviewed without a team.">
        <Table
          rows={teams}
          cols={[
            { header: "Team", cell: (r) => <span className="font-medium text-gray-900">{r.label}</span> },
            ...figureCols<GroupRow>(),
            shareCol(),
            { header: "With feedback", cell: (r) => pct(r.violations ? (r.withFeedback / r.violations) * 100 : null, 0), align: "right" },
          ]}
          bar={{ header: "Offsets", value: (r) => r.offsets }}
          foot={["Total", ...footFigures(total), "100%", pct(total.violations ? (total.withFeedback / total.violations) * 100 : null, 0)]}
        />
      </Section>
      <Section title="Offsets by team and month">
        <MatrixTable rowHeader="Team" cols={data.frame.months.map((m) => fiscalLabel(m))} rows={grid.map((g) => ({ label: g.label, cells: g.cells.map((c) => c.offsets) }))} />
      </Section>
      <Section title="Offsets by team and program">
        <MatrixTable
          rowHeader="Team"
          cols={cross.cols.map((c) => c.label)}
          rows={cross.rows.map((r) => ({ label: r.label, cells: cross.cols.map((c) => cross.cell(r.key, c.key).offsets) }))}
        />
      </Section>
      <Section title="Most common root causes" description="As the analysts wrote them when reviewing violations.">
        <Table
          rows={causes}
          empty="No root causes recorded in this time frame."
          cols={[
            { header: "Root cause", cell: (r) => <span className="text-gray-900">{r.cause}</span> },
            { header: "Teams", cell: (r) => r.teams.join(", ") || "—" },
            { header: "Violations", cell: (r) => n(r.violations), align: "right" },
            { header: "Offsets", cell: (r) => money(r.offsets), align: "right" },
          ]}
        />
      </Section>
    </div>
  );
}

function MatrixTable({ rowHeader, cols, rows }: { rowHeader: string; cols: string[]; rows: { label: string; cells: number[] }[] }) {
  if (!rows.length) return <p className="px-6 pb-6 text-sm text-gray-400">Nothing in this time frame.</p>;
  const max = Math.max(...rows.flatMap((r) => r.cells), 0);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{rowHeader}</th>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap">
                {c}
              </th>
            ))}
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-gray-200">
              <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{r.label}</td>
              {r.cells.map((v, i) => (
                // Shade each cell by its size against the largest cell (one blue, light to dark)
                <td
                  key={i}
                  className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-gray-900"
                  style={v && max ? { backgroundColor: `rgba(37, 99, 235, ${0.06 + (v / max) * 0.3})` } : undefined}
                >
                  {v ? money(v) : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap text-gray-900">{money(r.cells.reduce((s, v) => s + v, 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Issues ──────────────────────────────────────────────────────

export function IssuesTab({ data, access }: { data: Insights; access: Access }) {
  const ins = issueInsights(data.issues, data.frame.months, fiscalMonthOf);
  const link = (i: { id: string; number: number; title: string }) =>
    access.issues ? (
      <Link href={`/issues/${i.id}`} className="text-blue-600 hover:underline">
        {issueLabel(i.number)}
      </Link>
    ) : (
      issueLabel(i.number)
    );
  const countCols = (header: string): Col<{ label: string; count: number; open: number; offsets: number; estimated: number }>[] => [
    { header, cell: (r) => <span className="text-gray-900">{r.label}</span> },
    { header: "Issues", cell: (r) => n(r.count), align: "right" },
    { header: "Open", cell: (r) => n(r.open), align: "right" },
    { header: "Expected fines", cell: (r) => (r.estimated ? dollars(r.estimated) : "—"), align: "right" },
    { header: "Assessed on POs", cell: (r) => (r.offsets ? money(r.offsets) : "—"), align: "right" },
  ];
  const est = ins.estimated;

  return (
    <div className="space-y-6">
      <StatTiles
        stats={[
          { label: "Issues logged", value: n(ins.total), hint: "by date of the issue" },
          { label: "Still open", value: n(ins.open), tone: ins.open ? "text-red-700" : undefined },
          { label: "Average days to resolve", value: ins.avgDaysToResolve === null ? "—" : ins.avgDaysToResolve.toFixed(1) },
          { label: "Expected fines", value: dollars(est.expected), hint: `estimated on ${n(est.issues)} issue(s)` },
          { label: "Assessed on their POs", value: money(est.assessed), hint: `${money(ins.linkedOffsets)} on all ${n(ins.withViolations)} issue(s) with violations` },
          { label: "Past follow-up date", value: n(ins.overdue.length), tone: ins.overdue.length ? "text-red-700" : undefined, hint: "open issues, any date" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="By category">
          <Table rows={ins.byCategory} cols={countCols("Category")} bar={{ header: "Issues", value: (r) => r.count }} />
        </Section>
        <Section title="By team responsible">
          <Table rows={ins.byTeam} cols={countCols("Team")} bar={{ header: "Issues", value: (r) => r.count }} />
        </Section>
        <Section title="By severity">
          <Table rows={ins.bySeverity.map((r) => ({ ...r, label: ISSUE_SEVERITIES[r.key as keyof typeof ISSUE_SEVERITIES] ?? r.label }))} cols={countCols("Severity")} />
        </Section>
        <Section title="By status">
          <Table rows={ins.byStatus.map((r) => ({ ...r, label: ISSUE_STATUSES[r.key as keyof typeof ISSUE_STATUSES]?.label ?? r.label }))} cols={countCols("Status")} />
        </Section>
        <Section title="Issues logged per month" description="Newest month first.">
          <Table rows={ins.byMonth} cols={[{ header: "Month", cell: (r) => <span className="text-gray-900">{r.label}</span> }, { header: "Issues", cell: (r) => n(r.count), align: "right" }]} bar={{ header: "Issues", value: (r) => r.count }} />
        </Section>
        <Section title="Open issues by age" description="Every open or in-progress issue, by days since the issue date.">
          <Table rows={ins.aging} cols={[{ header: "Age", cell: (r) => <span className="text-gray-900">{r.label}</span> }, { header: "Open issues", cell: (r) => n(r.count), align: "right" }]} bar={{ header: "Issues", value: (r) => r.count }} />
        </Section>
      </div>
      <Section
        title="Expected vs. assessed fines"
        description="The estimated maximum fine on each issue against THD's offsets on its POs so far. Assessed fills in as THD's exports for the POs are imported; POs found shows how many THD's data covers yet."
      >
        <Table
          rows={ins.fineRows}
          empty="No issue in this time frame has an estimate or offsets on its POs yet."
          cols={[
            { header: "Issue", cell: (r) => link(r) },
            { header: "Title", cell: (r) => <span className="text-gray-900">{r.title}</span> },
            { header: "Status", cell: (r) => ISSUE_STATUSES[r.status].label },
            { header: "POs found", cell: (r) => `${n(r.posFound)} of ${n(r.poCount)}`, align: "right" },
            { header: "Expected", cell: (r) => (r.estimatedFine === null ? <span className="text-gray-400">No estimate</span> : dollars(r.estimatedFine)), align: "right" },
            { header: "Assessed", cell: (r) => (r.offsets ? money(r.offsets) : "—"), align: "right" },
            {
              header: "Assessed − expected",
              cell: (r) =>
                r.estimatedFine === null ? (
                  "—"
                ) : (
                  <span className={r.offsets > r.estimatedFine ? "text-red-700" : "text-gray-700"}>{signedMoney(r.offsets - r.estimatedFine)}</span>
                ),
              align: "right",
            },
          ]}
          foot={["Issues with an estimate", "", "", "", dollars(est.expected), money(est.assessed), signedMoney(est.difference)]}
        />
      </Section>
      <Section title="Costliest issues" description="Issues whose POs carry the most offsets in the compliance data.">
        <Table
          rows={ins.costliest}
          empty="No issues in this time frame have POs with offsets yet."
          cols={[
            { header: "Issue", cell: (r) => link(r) },
            { header: "Title", cell: (r) => <span className="text-gray-900">{r.title}</span> },
            { header: "Date", cell: (r) => formatUtcDate(r.issueDate) },
            { header: "Status", cell: (r) => ISSUE_STATUSES[r.status].label },
            { header: "Violations", cell: (r) => n(r.violations), align: "right" },
            { header: "Offsets", cell: (r) => money(r.offsets), align: "right" },
          ]}
        />
      </Section>
      <Section title="Past their follow-up date" description="Open issues whose follow-up date has passed.">
        <Table
          rows={ins.overdue}
          empty="No open issue is past its follow-up date."
          cols={[
            { header: "Issue", cell: (r) => link(r) },
            { header: "Title", cell: (r) => <span className="text-gray-900">{r.title}</span> },
            { header: "Follow-up date", cell: (r) => <span className="text-red-700">{formatUtcDate(r.followUpDate)}</span> },
            { header: "Team", cell: (r) => (r.team ?? "—") },
            { header: "Status", cell: (r) => ISSUE_STATUSES[r.status].label },
          ]}
        />
      </Section>
    </div>
  );
}

// ─── Disputes ────────────────────────────────────────────────────

export function DisputesTab({ data }: { data: Insights }) {
  const now = figures(data.lines);
  const pipeline = disputePipeline(data.lines);
  const gaps = disputeGaps(data.lines);
  const days = averageDecisionDays(data.lines);
  const disputedLines = data.lines.filter((l) => isViolation(l) && l.dispute && l.dispute.status !== "WITHDRAWN");
  const byMetric = groupBy(disputedLines, metricKey, (_k, l) => `${l.programName} · ${l.metricName}`).sort((a, b) => b.disputed - a.disputed);
  const byReason = groupBy(disputedLines, (l) => l.dispute?.reasonCode ?? null).sort((a, b) => b.disputed - a.disputed);
  const disputedOffsets = disputedLines.reduce((s, l) => s + l.offset, 0);
  const winCols: Col<GroupRow>[] = [
    { header: "Disputed", cell: (r) => n(r.disputed), align: "right" },
    { header: "Decided", cell: (r) => n(r.decided), align: "right" },
    { header: "Won", cell: (r) => n(r.won), align: "right" },
    { header: "Win rate", cell: (r) => pct(winRate(r), 0), align: "right" },
    { header: "Recovered", cell: (r) => (r.recovered ? <span className="text-green-700">{money(r.recovered)}</span> : "—"), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <StatTiles
        stats={[
          { label: "Violations disputed", value: n(now.disputed), hint: `${pct(now.violations ? (now.disputed / now.violations) * 100 : null, 0)} of violations` },
          { label: "Win rate", value: pct(winRate(now), 0), hint: `${n(now.won)} of ${n(now.decided)} decided` },
          { label: "Recovered", value: money(now.recovered), tone: now.recovered ? "text-green-700" : undefined, hint: `${pct(disputedOffsets ? (now.recovered / disputedOffsets) * 100 : null, 0)} of disputed offsets` },
          { label: "Awaiting THD decision", value: money(now.awaiting), tone: now.awaiting ? "text-amber-700" : undefined },
          { label: "Average days to decision", value: days === null ? "—" : days.toFixed(1), hint: "submitted to decided" },
          { label: "Disputable, not disputed", value: n(gaps.disputableNotDisputed.count), hint: money(gaps.disputableNotDisputed.offsets), tone: gaps.disputableNotDisputed.count ? "text-red-700" : undefined },
        ]}
      />
      <Section title="Dispute pipeline" description="Disputes on this time frame's violations by status.">
        <Table
          rows={pipeline.filter((p) => p.count)}
          empty="No disputes in this time frame."
          cols={[
            { header: "Status", cell: (r) => <span className="text-gray-900">{DISPUTE_STATUS_LABELS[r.status]}</span> },
            { header: "Disputes", cell: (r) => n(r.count), align: "right" },
            { header: "Amount disputed", cell: (r) => money(r.disputed), align: "right" },
            { header: "Recovered", cell: (r) => (r.recovered ? <span className="text-green-700">{money(r.recovered)}</span> : "—"), align: "right" },
          ]}
          bar={{ header: "Disputes", value: (r) => r.count }}
        />
      </Section>
      <Section title="Win rate by compliance type">
        <Table rows={byMetric} empty="No disputes in this time frame." cols={[{ header: "Program · Metric", cell: (r) => <span className="text-gray-900">{r.label}</span> }, ...winCols]} />
      </Section>
      <Section title="Win rate by dispute reason code" description="THD's reason code chosen for each dispute.">
        <Table rows={byReason} empty="No disputes in this time frame." cols={[{ header: "Reason code", cell: (r) => <span className="text-gray-900">{r.label}</span> }, ...winCols]} />
      </Section>
    </div>
  );
}

// ─── Locations & carriers ────────────────────────────────────────

export function LocationsTab({ data, access }: { data: Insights; access: Access }) {
  const dcs = groupBy(data.lines, (l) => l.dcNumber?.trim() || null, (k) => `DC ${k}`);
  const carriers = groupBy(data.lines, (l) => l.carrier?.toUpperCase() ?? null, (_k, l) => l.carrier ?? "");
  const skus = groupBy(data.lines, (l) => l.sku?.trim() || null, (k, l) => (l.skuDescription ? `${k} · ${l.skuDescription}` : k)).sort((a, b) => b.violations - a.violations || b.offsets - a.offsets);
  const repeat = repeatPos(data.lines);
  const cols = (header: string): Col<GroupRow>[] => [
    { header, cell: (r) => <span className="text-gray-900">{r.label}</span> },
    { header: "Violations", cell: (r) => n(r.violations), align: "right" },
    { header: "Offsets", cell: (r) => money(r.offsets), align: "right" },
    shareCol(),
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="By THD location" description="The DC or store THD recorded on each violation.">
          <Table rows={dcs.slice(0, 15)} cols={cols("Location")} bar={{ header: "Offsets", value: (r) => r.offsets }} />
        </Section>
        <Section title="By carrier" description="The carrier THD recorded, where the export has one.">
          <Table rows={carriers.slice(0, 15)} cols={cols("Carrier")} bar={{ header: "Offsets", value: (r) => r.offsets }} />
        </Section>
      </div>
      <Section title="SKUs with the most violations">
        <Table rows={skus.filter((s) => s.key).slice(0, 15)} cols={cols("SKU")} />
      </Section>
      <Section title="POs with more than one violation" description="Repeat problems on the same PO in this time frame.">
        <Table
          rows={repeat}
          empty="No PO has more than one violation in this time frame."
          cols={[
            { header: "PO #", cell: (r) => <PoLink po={r.poNumber} recordId={r.poRecordId} access={access} /> },
            { header: "Compliance types", cell: (r) => r.metrics.join(", ") },
            { header: "Months", cell: (r) => r.months.join(", ") },
            { header: "Violations", cell: (r) => n(r.violations), align: "right" },
            { header: "Offsets", cell: (r) => money(r.offsets), align: "right" },
          ]}
        />
      </Section>
    </div>
  );
}

