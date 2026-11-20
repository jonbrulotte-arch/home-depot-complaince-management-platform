import Link from "next/link";
import { FileText } from "lucide-react";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import type { IssueReport } from "@/lib/issue-report";
import { cn, formatCurrency, formatDateTime, formatUtcDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// The Summarizer's Issues report on the page; issue-report-pdf.ts writes the same as a PDF.

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const thr = cn(th, "text-right");
const td = "px-4 py-2.5 text-sm";
const tdr = cn(td, "text-right");
const dollars = (n: number) => formatCurrency(n).replace(/\.00$/, "");

type Row = IssueReport["issues"][number];

export function IssueReportView({ report, timeZone, canOpenIssues }: { report: IssueReport; timeZone: string; canOpenIssues: boolean }) {
  const t = report.totals;
  const stats: [string, string, string?, string?][] = [
    ["Issues logged", String(t.issues), undefined, `${t.open} still open`],
    ["Resolved in the period", String(t.resolvedInRange), t.resolvedInRange ? "text-green-700" : undefined, "including earlier issues"],
    ["POs on the issues", String(t.pos), undefined, `${t.posFound} in the compliance data`],
    ["Violations on their POs", String(t.violations)],
    ["Assessed offsets", formatCurrency(t.offsets), t.offsets ? "text-red-700" : undefined, t.recovered ? `${formatCurrency(t.recovered)} recovered` : "THD's charges on their POs"],
    ["Estimated maximum fines", dollars(t.estimated.expected), undefined, `${t.estimated.issues} issue(s) with an estimate`],
  ];
  const issueLink = (i: { id: string; number: number }) =>
    canOpenIssues ? (
      <Link href={`/issues/${i.id}`} className="font-medium text-blue-600 hover:underline">
        {issueLabel(i.number)}
      </Link>
    ) : (
      <span className="font-medium text-gray-900">{issueLabel(i.number)}</span>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Issues Report: {report.range.label}</h2>
          <p className="text-sm text-gray-500">
            Issues dated in the period, the compliance data on their POs so far, and {t.updates} update(s) made during it.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/summarizer/issues-pdf?from=${report.range.fromKey}&to=${report.range.toKey}`}>
            <FileText className="h-4 w-4 mr-1.5" />
            Export PDF
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(([label, value, tone, hint]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn("text-xl font-bold text-gray-900", tone)}>{value}</p>
            {hint && <p className="text-xs text-gray-400">{hint}</p>}
          </div>
        ))}
      </div>

      {t.estimated.issues > 0 && (
        <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Expected vs. assessed:</strong> the {t.estimated.issues} issue(s) with an estimate were expected to cost up to {dollars(t.estimated.expected)}; THD has assessed{" "}
          {formatCurrency(t.estimated.assessed)} on their POs so far
          {t.estimated.assessed > t.estimated.expected ? `, ${formatCurrency(t.estimated.assessed - t.estimated.expected)} more than estimated` : ""}. THD&apos;s data runs a month or two behind,
          so recent issues may not be charged yet.
        </p>
      )}

      {report.issues.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-gray-400">No issues are dated in this period.</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Breakdown title="By category" rows={report.byCategory} />
            <Breakdown title="By team responsible" rows={report.byTeam} />
            <Breakdown title="By severity" rows={report.bySeverity.map((r) => ({ ...r, label: ISSUE_SEVERITIES[r.label as keyof typeof ISSUE_SEVERITIES] ?? r.label }))} />
            <Breakdown title="By status (now)" rows={report.byStatus.map((r) => ({ ...r, label: ISSUE_STATUSES[r.label as keyof typeof ISSUE_STATUSES]?.label ?? r.label }))} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>Issues</CardTitle>
              <CardDescription>Newest first. Assessed is THD&apos;s offsets on the issue&apos;s POs so far.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className={th}>Issue</th>
                    <th className={th}>Date</th>
                    <th className={th}>Title</th>
                    <th className={th}>Status</th>
                    <th className={th}>Severity</th>
                    <th className={th}>Team</th>
                    <th className={thr}>POs</th>
                    <th className={thr}>Est. fine</th>
                    <th className={thr}>Assessed</th>
                  </tr>
                </thead>
                <tbody>
                  {report.issues.map((i) => (
                    <tr key={i.id} className="border-t border-gray-200 align-top">
                      <td className={td}>{issueLink(i)}</td>
                      <td className={cn(td, "whitespace-nowrap text-gray-700")}>{formatUtcDate(i.issueDate)}</td>
                      <td className={cn(td, "text-gray-900")}>
                        <a href={`#issue-${i.number}`} className="hover:underline">
                          {i.title}
                        </a>
                        <span className="block text-xs text-gray-500">{i.category}</span>
                      </td>
                      <td className={td}>
                        <Badge variant={ISSUE_STATUSES[i.status].variant}>{ISSUE_STATUSES[i.status].label}</Badge>
                      </td>
                      <td className={cn(td, "text-gray-700")}>{ISSUE_SEVERITIES[i.severity]}</td>
                      <td className={cn(td, "text-gray-700")}>{i.team ?? "—"}</td>
                      <td className={cn(tdr, "text-gray-700")}>{i.pos.length ? `${i.posFound} of ${i.pos.length}` : "—"}</td>
                      <td className={cn(tdr, "text-gray-700")}>{i.estimatedFine === null ? "—" : dollars(i.estimatedFine)}</td>
                      <td className={cn(tdr, i.offsets ? "font-medium text-gray-900" : "text-gray-400")}>{i.offsets ? formatCurrency(i.offsets) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-900">
                    <td className={td} colSpan={6}>
                      Total
                    </td>
                    <td className={tdr}>{`${t.posFound} of ${t.pos}`}</td>
                    <td className={tdr}>{dollars(t.estimated.expected)}</td>
                    <td className={tdr}>{formatCurrency(t.offsets)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Issue details</h3>
            {report.issues.map((i) => (
              <IssueDetail key={i.id} issue={i} timeZone={timeZone} link={issueLink(i)} />
            ))}
          </div>
        </>
      )}

      {report.earlier.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Earlier issues with activity in the period</h3>
            <p className="text-sm text-gray-500">Issues dated before the period that were logged, updated or resolved during it.</p>
          </div>
          {report.earlier.map((i) => (
            <IssueDetail key={i.id} issue={i} timeZone={timeZone} link={issueLink(i)} activity={[i.loggedInRange && "logged in the period", i.resolvedInRange && "resolved in the period"].filter((s): s is string => Boolean(s))} />
          ))}
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; count: number; open: number; offsets: number }[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>{title.replace(/^By /, "").replace(/ \(now\)$/, "").replace(/^./, (c) => c.toUpperCase())}</th>
            <th className={thr}>Issues</th>
            <th className={thr}>Open</th>
            <th className={thr}>Assessed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-gray-200">
              <td className={cn(td, "text-gray-900")}>{r.label}</td>
              <td className={cn(tdr, "text-gray-700")}>{r.count}</td>
              <td className={cn(tdr, r.open ? "text-gray-700" : "text-gray-400")}>{r.open || "—"}</td>
              <td className={cn(tdr, r.offsets ? "text-gray-900" : "text-gray-400")}>{r.offsets ? formatCurrency(r.offsets) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function IssueDetail({ issue: i, timeZone, link, activity = [] }: { issue: Row | IssueReport["earlier"][number]; timeZone: string; link: React.ReactNode; activity?: string[] }) {
  const facts: [string, string][] = [
    ["Date", formatUtcDate(i.issueDate)],
    ["Category", i.category],
    ["Severity", ISSUE_SEVERITIES[i.severity]],
    ["Team responsible", i.team ?? "—"],
    ["THD program", i.program ?? "—"],
    [i.hdTickets.length > 1 ? "HD Support tickets" : "HD Support ticket", i.hdTickets.join(", ") || "—"],
    ["Estimated maximum fine", i.estimatedFine === null ? "—" : dollars(i.estimatedFine)],
    ["Follow-up date", i.followUpDate ? formatUtcDate(i.followUpDate) : "—"],
    ["Resolved", i.resolvedAt ? formatDateTime(i.resolvedAt, timeZone) : "—"],
  ];
  const text: [string, string | null][] = [
    ["What happened", i.description],
    ["Actions taken", i.actionsTaken],
    ["Consequences", i.consequences],
    ["Resolution", i.resolution],
  ];
  const violations = i.pos.flatMap((p) => p.violations.map((v) => ({ po: p.poNumber, ...v })));
  const notFound = i.pos.filter((p) => !p.found).map((p) => p.poNumber);
  const clean = i.pos.filter((p) => p.found && !p.violations.length).map((p) => p.poNumber);

  return (
    <Card id={`issue-${i.number}`} className="scroll-mt-6 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {link}
          <CardTitle>{i.title}</CardTitle>
          <Badge variant={ISSUE_STATUSES[i.status].variant}>{ISSUE_STATUSES[i.status].label}</Badge>
          {activity.map((a) => (
            <Badge key={a} variant="outline">
              {a}
            </Badge>
          ))}
        </div>
        <CardDescription>
          Logged {formatDateTime(i.createdAt, timeZone)}
          {i.createdBy ? ` by ${i.createdBy}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm md:grid-cols-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-gray-500">{k}</dt>
              <dd className="text-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-3 text-sm">
          {text
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <p className="font-semibold text-gray-900">{k}</p>
                <p className="whitespace-pre-wrap text-gray-700">{v}</p>
              </div>
            ))}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">POs and violations</p>
          {!i.pos.length ? (
            <p className="text-sm text-gray-400">No POs were listed.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {violations.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {["PO #", "Month", "Program · Metric", "Offset", "Team", "Dispute"].map((h) => (
                          <th key={h} className={h === "Offset" ? thr : th}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {violations.map((v, n) => (
                        <tr key={n} className="border-t border-gray-200">
                          <td className={cn(td, "text-gray-900")}>{v.po}</td>
                          <td className={cn(td, "text-gray-700")}>{v.month}</td>
                          <td className={cn(td, "text-gray-700")}>
                            {v.program} · {v.metric}
                          </td>
                          <td className={cn(tdr, "text-gray-900")}>{formatCurrency(v.offset)}</td>
                          <td className={cn(td, "text-gray-700")}>{v.team ?? "—"}</td>
                          <td className={cn(td, "text-gray-700")}>
                            {v.disputeStatus ? DISPUTE_STATUS_LABELS[v.disputeStatus] : "—"}
                            {v.recovered > 0 && (v.disputeStatus === "APPROVED" || v.disputeStatus === "PARTIAL") && <span className="text-green-700"> · {formatCurrency(v.recovered)} recovered</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {clean.length > 0 && <p className="text-sm text-gray-500">No violations on: {clean.join(", ")}.</p>}
              {notFound.length > 0 && <p className="text-sm text-gray-500">Not in the compliance data yet: {notFound.join(", ")}.</p>}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Updates in the period</p>
          {!i.updates.length ? (
            <p className="text-sm text-gray-400">No updates during the period.</p>
          ) : (
            <ul className="mt-2 space-y-3 border-l-2 border-gray-200 pl-4">
              {i.updates.map((u, n) => (
                <li key={n} className="text-sm">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-gray-900">{u.author ?? "Former user"}</span> · {formatDateTime(u.createdAt, timeZone)}
                  </p>
                  <p className="whitespace-pre-wrap text-gray-700">{u.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
