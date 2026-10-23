import type { ScorecardData } from "@/lib/scorecard";

// Summarizer: one or more published scorecards rolled into a summary of their violations, grouped
// by compliance type, and written out as an email for the team. Pure, so it is unit-tested; the
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

export function defaultSubject(summary: Summary): string {
  return `THD Compliance Summary: ${periodsLabel(summary)}`;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailLinks {
  /** The site's address, e.g. http://10.0.10.106:8014 */
  origin: string;
  /** The public dashboard page (`/d/<token>`), or null when it is turned off */
  dashboardPath: string | null;
}

/** The summary as an email: rich HTML to paste into Outlook or Gmail, and the same in plain text. */
export function summaryEmail(summary: Summary, links: EmailLinks, intro = ""): { html: string; text: string } {
  const multi = summary.reports.length > 1;
  const url = (path: string) => `${links.origin}${path}`;
  const font = "font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827";
  const th = "padding:6px 10px;border:1px solid #e5e7eb;background:#f9fafb;text-align:left;font-size:12px;color:#6b7280";
  const td = "padding:6px 10px;border:1px solid #e5e7eb;text-align:left;font-size:13px;color:#111827";
  const tdr = `${td};text-align:right`;
  const table = (head: string[], rows: string[][], right: number[] = []) =>
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px 0">` +
    `<tr>${head.map((h, i) => `<th style="${right.includes(i) ? `${th};text-align:right` : th}">${esc(h)}</th>`).join("")}</tr>` +
    rows.map((r) => `<tr>${r.map((c, i) => `<td style="${right.includes(i) ? tdr : td}">${c}</td>`).join("")}</tr>`).join("") +
    `</table>`;
  const link = (path: string, label: string) => `<a href="${esc(url(path))}" style="color:#2563eb">${esc(label)}</a>`;

  const html: string[] = [`<div style="${font}">`];
  const text: string[] = [];
  if (intro.trim()) {
    html.push(`<p style="margin:0 0 16px 0">${esc(intro.trim()).replace(/\n/g, "<br>")}</p>`);
    text.push(intro.trim(), "");
  }

  // Overview of each period
  html.push(`<h3 style="margin:0 0 8px 0;font-size:16px">Overview: ${esc(periodsLabel(summary))}</h3>`);
  text.push(`OVERVIEW: ${periodsLabel(summary)}`);
  const overview = summary.reports.map((r) => [
    esc(r.periodLabel),
    String(r.violations),
    money(r.preOffset),
    money(r.recovered),
    money(r.postOffset),
    money(r.awaiting),
    link(r.scorecardPath, "View scorecard"),
  ]);
  if (multi) overview.push(["<b>Total</b>", `<b>${summary.totals.violations}</b>`, `<b>${money(summary.totals.preOffset)}</b>`, `<b>${money(summary.totals.recovered)}</b>`, `<b>${money(summary.totals.postOffset)}</b>`, `<b>${money(summary.totals.awaiting)}</b>`, ""]);
  html.push(table(["Period", "Violations", "Offsets", "Recovered", "Post-dispute", "Awaiting THD decision", "Scorecard"], overview, [1, 2, 3, 4, 5]));
  const awaitingText = (amount: number, disputes: number) => (disputes ? `, ${money(amount)} submitted and awaiting THD's decision (${disputes} dispute${disputes === 1 ? "" : "s"})` : "");
  for (const r of summary.reports) {
    text.push(`- ${r.periodLabel}: ${r.violations} violation(s), ${money(r.preOffset)} in offsets, ${money(r.recovered)} recovered, ${money(r.postOffset)} post-dispute${awaitingText(r.awaiting, r.awaitingDisputes)}. Scorecard: ${url(r.scorecardPath)}`);
  }
  if (multi) text.push(`- Total: ${summary.totals.violations} violation(s), ${money(summary.totals.preOffset)} in offsets, ${money(summary.totals.postOffset)} post-dispute${awaitingText(summary.totals.awaiting, summary.totals.awaitingDisputes)}`);
  if (links.dashboardPath) {
    html.push(`<p style="margin:0 0 16px 0">${link(links.dashboardPath, "Open the compliance dashboard")}</p>`);
    text.push(`Compliance dashboard: ${url(links.dashboardPath)}`);
  }
  text.push("");

  // Violations by compliance type
  html.push(`<h3 style="margin:0 0 8px 0;font-size:16px">Violations by compliance type</h3>`);
  text.push("VIOLATIONS BY COMPLIANCE TYPE");
  if (!summary.groups.length) {
    html.push(`<p style="margin:0 0 16px 0;color:#6b7280">No violations.</p>`);
    text.push("No violations.", "");
  }
  for (const g of summary.groups) {
    const title = `${g.program} · ${g.metric}`;
    const groupAside = `${g.violations} violation${g.violations === 1 ? "" : "s"}, ${money(g.offset)}${g.awaitingDisputes ? `, ${money(g.awaiting)} awaiting THD decision` : ""}`;
    html.push(`<p style="margin:0 0 6px 0"><b>${esc(title)}</b> <span style="color:#6b7280">(${groupAside})</span></p>`);
    const head = [...(multi ? ["Period"] : []), "PO #", "Offset", "Team responsible", "Awaiting THD decision"];
    const rows = g.rows.map((r) => [...(multi ? [esc(r.periodLabel)] : []), esc(r.poNumber ?? "—"), money(r.offset), esc(r.team), r.awaiting ? money(r.awaiting) : "—"]);
    html.push(table(head, rows, multi ? [2, 4] : [1, 3]));
    text.push(`${title} (${groupAside})`);
    for (const r of g.rows) text.push(`  - PO ${r.poNumber ?? "—"}${multi ? ` (${r.periodLabel})` : ""}: ${money(r.offset)}, ${r.team}${r.awaiting ? `, ${money(r.awaiting)} awaiting THD decision` : ""}`);
    text.push("");
  }

  // By team
  if (summary.teams.length) {
    html.push(`<h3 style="margin:0 0 8px 0;font-size:16px">By team responsible</h3>`);
    html.push(table(["Team", "Violations", "Offsets", "Awaiting THD decision"], summary.teams.map((t) => [esc(t.team), String(t.violations), money(t.offset), t.awaiting ? money(t.awaiting) : "—"]), [1, 2, 3]));
    text.push("BY TEAM RESPONSIBLE");
    for (const t of summary.teams) text.push(`- ${t.team}: ${t.violations} violation(s), ${money(t.offset)}${t.awaiting ? `, ${money(t.awaiting)} awaiting THD decision` : ""}`);
  }
  html.push(`</div>`);
  return { html: html.join(""), text: text.join("\n").trim() };
}
