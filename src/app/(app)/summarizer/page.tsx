import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { recentPublishedReports } from "@/lib/dashboard";
import { scorecardData } from "@/lib/scorecard-store";
import { ensureShareToken } from "@/lib/scorecard-share";
import { buildSummary, periodsLabel, type Summary } from "@/lib/summarizer";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportPicker } from "./report-picker";
import { SummaryEmail } from "./summary-email";

const MAX_REPORTS = 24;
const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-4 py-2.5 text-sm";

export default async function SummarizerPage({ searchParams }: { searchParams: Promise<{ r?: string | string[] }> }) {
  const user = await requirePagePermission("summarizer.use");
  const { r } = await searchParams;
  const requested = [...new Set((Array.isArray(r) ? r.join(",") : (r ?? "")).split(","))].filter((id) => /^[a-z0-9]{20,40}$/i.test(id)).slice(0, MAX_REPORTS);

  const [published, settings] = await Promise.all([
    recentPublishedReports(500),
    prisma.siteSettings.findUnique({ where: { id: "site" }, select: { publicDashboardToken: true } }),
  ]);
  const chosen = requested.length
    ? await prisma.complianceReport.findMany({
        where: { id: { in: requested }, status: "PUBLISHED", scorecard: { publishedAt: { not: null } } },
        select: { id: true, title: true, scorecard: { select: { data: true } } },
      })
    : [];
  const summary = chosen.length
    ? buildSummary(
        await Promise.all(
          chosen.map(async (c) => ({
            reportId: c.id,
            title: c.title,
            data: scorecardData(c.scorecard!.data),
            // The team may not have accounts, so the email links to the public scorecard pages
            scorecardPath: await ensureShareToken(c.id).then((t) => (t ? `/s/${t}` : `/scorecards/${c.id}`)),
          })),
        ),
      )
    : null;
  const dashboardPath = settings?.publicDashboardToken ? `/d/${settings.publicDashboardToken}` : null;

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
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Scorecard Summary: {periodsLabel(summary)}</h2>
        {dashboardPath && (
          <a href={dashboardPath} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            Public dashboard <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
              {["Period", "Violations", "Offsets", "Recovered", "Post-dispute", "Scorecard"].map((h) => (
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
              </p>
            </CardHeader>
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {[...(multi ? ["Period"] : []), "PO #", "Offset", "Team responsible"].map((h) => (
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
                {["Team", "Violations", "Offsets"].map((h) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
