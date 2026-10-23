import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { recentPublishedReports } from "@/lib/dashboard";
import { parseReportIds, periodsLabel, type Summary } from "@/lib/summarizer";
import { loadSummary } from "@/lib/summarizer-data";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportPicker } from "./report-picker";
import { SummaryEmail } from "./summary-email";

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-4 py-2.5 text-sm";

export default async function SummarizerPage({ searchParams }: { searchParams: Promise<{ r?: string | string[] }> }) {
  const user = await requirePagePermission("summarizer.use");
  const { r } = await searchParams;
  const requested = parseReportIds(r);
  const [published, { summary, dashboardPath }] = await Promise.all([recentPublishedReports(500), loadSummary(requested)]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Summarizer</h1>
        <p className="text-sm text-gray-500 mt-1">Pick one or more published compliance reports to summarize their violations for the team, then copy the summary into an email.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Compliance reports</CardTitle>
          <CardDescription>Published reports, the most recent month first.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportPicker reports={published} selected={summary ? summary.reports.map((s) => s.reportId) : []} />
        </CardContent>
      </Card>

      {requested.length > 0 && !summary && <p className="text-sm text-gray-500">None of the chosen reports is published any more. Pick reports above.</p>}

      {summary && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Email</CardTitle>
              <CardDescription>
                Links go to the public scorecard pages{dashboardPath ? " and the public dashboard" : ""}, so people without an account can open them.
                {!dashboardPath && (
                  <>
                    {" "}The public dashboard is off, so the email leaves it out
                    {user.permissions.has("admin.settings") ? (
                      <>
                        {" "}(turn it on in{" "}
                        <Link href="/admin/settings" className="text-blue-600 hover:underline">
                          Settings
                        </Link>
                        )
                      </>
                    ) : null}
                    .
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SummaryEmail key={summary.reports.map((s) => s.reportId).join(",")} summary={summary} dashboardPath={dashboardPath} />
            </CardContent>
          </Card>
          <SummaryView summary={summary} dashboardPath={dashboardPath} />
        </>
      )}
    </div>
  );
}

function SummaryView({ summary, dashboardPath }: { summary: Summary; dashboardPath: string | null }) {
  const multi = summary.reports.length > 1;
  const stats: [string, string, string?][] = [
    ["Violations", String(summary.totals.violations)],
    ["Offsets", formatCurrency(summary.totals.preOffset)],
    ["Recovered in disputes", formatCurrency(summary.totals.recovered), "text-green-700"],
    ["Post-dispute offsets", formatCurrency(summary.totals.postOffset), summary.totals.postOffset > 0 ? "text-red-700" : undefined],
    [`Awaiting THD decision (${summary.totals.awaitingDisputes} disputes)`, formatCurrency(summary.totals.awaiting), summary.totals.awaiting > 0 ? "text-amber-700" : undefined],
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Scorecard Summary: {periodsLabel(summary)}</h2>
          {dashboardPath && (
            <a href={dashboardPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
              Public dashboard <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/summarizer/pdf?r=${summary.reports.map((s) => s.reportId).join(",")}`}>
            <FileText className="h-4 w-4 mr-1.5" />
            Export PDF
          </a>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn("text-xl font-bold text-gray-900", tone)}>{value}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Scorecards</CardTitle>
        </CardHeader>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              {["Period", "Violations", "Offsets", "Recovered", "Post-dispute", "Awaiting THD decision", "Scorecard"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.reports.map((r) => (
              <tr key={r.reportId} className="border-t border-gray-200">
                <td className={cn(td, "font-medium text-gray-900")}>{r.periodLabel}</td>
                <td className={cn(td, "text-gray-700")}>{r.violations}</td>
                <td className={cn(td, "text-gray-700")}>{formatCurrency(r.preOffset)}</td>
                <td className={cn(td, r.recovered ? "text-green-700" : "text-gray-400")}>{r.recovered ? formatCurrency(r.recovered) : "—"}</td>
                <td className={cn(td, "font-medium text-gray-900")}>{formatCurrency(r.postOffset)}</td>
                <td className={cn(td, r.awaiting ? "text-amber-700" : "text-gray-400")}>
                  {r.awaitingDisputes ? `${formatCurrency(r.awaiting)} (${r.awaitingDisputes})` : "—"}
                </td>
                <td className={td}>
                  <Link href={`/scorecards/${r.reportId}`} className="text-blue-600 hover:underline">
                    Open
                  </Link>
                  <a href={r.scorecardPath} target="_blank" rel="noreferrer" className="ml-3 inline-flex items-center gap-1 text-gray-500 hover:text-gray-700" title="The public scorecard page the email links to">
                    Public <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Violations by compliance type</h3>
        {summary.groups.length === 0 && <p className="text-sm text-gray-400">No violations in the chosen reports.</p>}
        {summary.groups.map((g) => (
          <Card key={`${g.program}|${g.metric}`} className="overflow-hidden">
            <CardHeader className="flex flex-row items-baseline justify-between space-y-0 pb-3">
              <CardTitle>
                {g.program} · {g.metric}
              </CardTitle>
              <p className="text-sm text-gray-500">
                {g.violations} violation(s) · <span className="font-medium text-gray-900">{formatCurrency(g.offset)}</span>
                {g.awaitingDisputes > 0 && <span className="text-amber-700"> · {formatCurrency(g.awaiting)} awaiting THD decision</span>}
              </p>
            </CardHeader>
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {[...(multi ? ["Period"] : []), "PO #", "Offset", "Team responsible", "Awaiting THD decision"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-200">
                    {multi && <td className={cn(td, "text-gray-700")}>{row.periodLabel}</td>}
                    <td className={cn(td, "text-gray-900")}>{row.poNumber ?? "—"}</td>
                    <td className={cn(td, "text-gray-900")}>{formatCurrency(row.offset)}</td>
                    <td className={cn(td, "text-gray-700")}>{row.team}</td>
                    <td className={cn(td, row.awaiting ? "text-amber-700" : "text-gray-400")}>{row.awaiting ? formatCurrency(row.awaiting) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      {summary.teams.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>By team responsible</CardTitle>
          </CardHeader>
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Team", "Violations", "Offsets", "Awaiting THD decision"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.teams.map((t) => (
                <tr key={t.team} className="border-t border-gray-200">
                  <td className={cn(td, "text-gray-900")}>{t.team}</td>
                  <td className={cn(td, "text-gray-700")}>{t.violations}</td>
                  <td className={cn(td, "font-medium text-gray-900")}>{formatCurrency(t.offset)}</td>
                  <td className={cn(td, t.awaiting ? "text-amber-700" : "text-gray-400")}>{t.awaiting ? formatCurrency(t.awaiting) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
