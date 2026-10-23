import Link from "next/link";
import { fiscalLabel } from "@/lib/fiscal";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { OffsetOverview, PublishedReportSummary } from "@/lib/dashboard";
import type { ScorecardData } from "@/lib/scorecard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RollingOffsetsChart } from "@/components/dashboard/rolling-offsets-chart";

// Sections shared by the dashboard and the public dashboard. Links are passed in, because the
// public one points at the scorecards' public pages.

export function RollingOffsetsCard({ overview }: { overview: OffsetOverview }) {
  if (overview.rolling.length < 2) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>12-month offset total over time</CardTitle>
        <CardDescription>
          Each month&apos;s total of pre-dispute offsets for that month and the 11 before it, the same figure as the 12-mo total below, across all imported data, with how much it changed from the month before.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RollingOffsetsChart points={overview.rolling} />
      </CardContent>
    </Card>
  );
}

export function OffsetsByProgramCard({ overview }: { overview: OffsetOverview }) {
  const { months, programs, cells, field } = overview;
  const cell = (pid: string, fm: number) => cells[`${pid}|${fm}`] ?? 0;
  const monthTotal = (fm: number) => programs.reduce((s, p) => s + cell(p.id, fm), 0);
  const rowTotal = (pid: string) => months.reduce((s, fm) => s + cell(pid, fm), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-dispute offsets by program</CardTitle>
        <CardDescription>
          {field === "receivedMonth" ? "By the month the data was received" : "By THD fiscal month assessed (FM01 = February)"}. Amounts are from the SPM exports before disputes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-gray-400">No compliance data has been imported yet.</p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                  {months.map((fm) => (
                    <th key={fm} className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">{fiscalLabel(fm)}</th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">12-mo total</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{p.name}</td>
                    {months.map((fm) => {
                      const v = cell(p.id, fm);
                      return (
                        <td key={fm} className={v ? "px-3 py-3 text-right text-red-700 font-medium" : "px-3 py-3 text-right text-gray-300"}>
                          {v ? formatCurrency(v) : "—"}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(rowTotal(p.id))}</td>
                  </tr>
                ))}
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-gray-900">Total</td>
                  {months.map((fm) => (
                    <td key={fm} className="px-3 py-3 text-right text-gray-900">{formatCurrency(monthTotal(fm))}</td>
                  ))}
                  <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(overview.twelveMonthTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Published reports, most recent month first, each linking to its scorecard */
export function RecentReportsCard({ reports, title = "Recent reports" }: { reports: (PublishedReportSummary & { href: string | null })[]; title?: string }) {
  if (!reports.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Published reports, the most recent month first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {reports.map((r) => {
          const body = (
            <>
              <span>
                <span className="text-sm font-medium text-gray-900">{r.title}</span>
                <span className="block text-xs text-gray-500">
                  Published {formatDate(r.publishedAt)} · {r.violations} violation(s) · {formatCurrency(r.postOffset)} post-dispute offsets
                </span>
              </span>
              <Badge variant="success">Published</Badge>
            </>
          );
          return r.href ? (
            <Link key={r.id} href={r.href} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50">
              {body}
            </Link>
          ) : (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3">
              {body}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Headline figures of the latest published scorecard */
export function LatestScorecardCard({ data }: { data: ScorecardData }) {
  return (
    <Card className="hover:border-blue-300">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-sm text-gray-500">Latest published scorecard</p>
          <p className="text-lg font-semibold text-gray-900">{data.periodLabel}</p>
        </div>
        <div className="flex gap-8 text-sm">
          <div><p className="text-gray-500">Pre-dispute</p><p className="font-semibold text-gray-900">{formatCurrency(data.totals.preOffset)}</p></div>
          <div><p className="text-gray-500">Recovered</p><p className="font-semibold text-green-700">{formatCurrency(data.totals.recovered)}</p></div>
          <div><p className="text-gray-500">Post-dispute</p><p className="font-semibold text-gray-900">{formatCurrency(data.totals.postOffset)}</p></div>
          <div>
            <p className="text-gray-500">Metrics below goal</p>
            <p className="font-semibold text-gray-900">{data.programs.flatMap((p) => p.metrics).filter((m) => m.meetsGoal === false).length}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
