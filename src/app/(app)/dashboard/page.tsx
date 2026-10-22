import Link from "next/link";
import { AlertTriangle, ClipboardCheck, DollarSign, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { ReportStatusBadge } from "@/components/shared/status-badges";
import { scorecardData } from "@/lib/scorecard-store";

export default async function DashboardPage() {
  const user = await requirePagePermission("view.dashboard");

  const latest = await prisma.complianceLine.aggregate({ _max: { fiscalMonth: true } });
  const lastMonth = latest._max.fiscalMonth;
  const months = lastMonth ? Array.from({ length: 12 }, (_, i) => shiftFiscalMonth(lastMonth, i - 11)) : [];

  const [programs, metrics, offsets, pendingReview, openReports, recentReports, latestScorecard] = await Promise.all([
    prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    prisma.metric.findMany({ select: { id: true, programId: true } }),
    months.length
      ? prisma.complianceLine.groupBy({
          by: ["metricId", "fiscalMonth"],
          where: { fiscalMonth: { gte: months[0], lte: months[11] }, isCompliant: false },
          _sum: { offsetAmount: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    prisma.complianceLine.count({ where: { isCompliant: false, OR: [{ review: null }, { review: { disposition: "PENDING" } }] } }),
    prisma.complianceReport.count({ where: { status: { not: "PUBLISHED" } } }),
    user.permissions.has("reports.view")
      ? prisma.complianceReport.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { period: true } })
      : Promise.resolve([]),
    prisma.scorecard.findFirst({ where: { publishedAt: { not: null } }, orderBy: { report: { period: { fiscalMonth: "desc" } } } }),
  ]);
  const published = latestScorecard ? scorecardData(latestScorecard.data) : null;

  const programOf = new Map(metrics.map((m) => [m.id, m.programId]));
  const cell = new Map<string, number>();
  for (const g of offsets) {
    const key = `${programOf.get(g.metricId)}|${g.fiscalMonth}`;
    cell.set(key, (cell.get(key) ?? 0) + Number(g._sum.offsetAmount ?? 0));
  }
  const monthTotal = (fm: number) => programs.reduce((s, p) => s + (cell.get(`${p.id}|${fm}`) ?? 0), 0);
  const rowTotal = (pid: string) => months.reduce((s, fm) => s + (cell.get(`${pid}|${fm}`) ?? 0), 0);
  const twelveMonthTotal = months.reduce((s, fm) => s + monthTotal(fm), 0);
  const lastMonthViolations = lastMonth ? offsets.filter((g) => g.fiscalMonth === lastMonth).reduce((s, g) => s + g._count._all, 0) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          THD compliance offsets and open work{lastMonth ? `, latest data ${fiscalLabel(lastMonth)} (FM ${lastMonth})` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DollarSign} label="12-month pre-dispute offsets" value={formatCurrency(twelveMonthTotal)} />
        <StatCard icon={FileSpreadsheet} label={lastMonth ? `Violations in ${fiscalLabel(lastMonth)}` : "Violations"} value={lastMonthViolations} tone="red" />
        <StatCard icon={AlertTriangle} label="Violations not yet reviewed (all periods)" value={pendingReview} tone="amber" />
        <StatCard icon={ClipboardCheck} label="Reports in progress" value={openReports} tone="green" />
      </div>

      {published && latestScorecard && (
        <Link href={`/scorecards/${latestScorecard.reportId}`} className="block">
          <Card className="hover:border-blue-300">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-sm text-gray-500">Latest published scorecard</p>
                <p className="text-lg font-semibold text-gray-900">{published.periodLabel}</p>
              </div>
              <div className="flex gap-8 text-sm">
                <div><p className="text-gray-500">Pre-dispute</p><p className="font-semibold text-gray-900">{formatCurrency(published.totals.preOffset)}</p></div>
                <div><p className="text-gray-500">Recovered</p><p className="font-semibold text-green-700">{formatCurrency(published.totals.recovered)}</p></div>
                <div><p className="text-gray-500">Post-dispute</p><p className="font-semibold text-gray-900">{formatCurrency(published.totals.postOffset)}</p></div>
                <div>
                  <p className="text-gray-500">Metrics below goal</p>
                  <p className="font-semibold text-gray-900">{published.programs.flatMap((p) => p.metrics).filter((m) => m.meetsGoal === false).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pre-dispute offsets by program</CardTitle>
          <CardDescription>By THD fiscal month assessed (FM01 = February). Amounts are from the SPM exports before disputes.</CardDescription>
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
                        const v = cell.get(`${p.id}|${fm}`) ?? 0;
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
                    <td className="px-4 py-3 text-right text-gray-900">{formatCurrency(twelveMonthTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {recentReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentReports.map((r) => (
              <Link key={r.id} href={`/reports/${r.id}`} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50">
                <span className="text-sm font-medium text-gray-900">{r.title}</span>
                <ReportStatusBadge status={r.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
