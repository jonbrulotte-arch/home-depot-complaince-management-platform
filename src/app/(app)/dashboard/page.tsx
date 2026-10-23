import Link from "next/link";
import { AlertTriangle, ClipboardCheck, DollarSign, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { fiscalLabel } from "@/lib/fiscal";
import { formatCurrency } from "@/lib/utils";
import { offsetOverview, recentPublishedReports } from "@/lib/dashboard";
import { scorecardData } from "@/lib/scorecard-store";
import { StatCard } from "@/components/shared/stat-card";
import { LatestScorecardCard, OffsetsByProgramCard, RecentReportsCard, RollingOffsetsCard } from "@/components/dashboard/dashboard-sections";

export default async function DashboardPage() {
  const user = await requirePagePermission("view.dashboard");

  const [overview, pendingReview, openReports, recent, latestScorecard] = await Promise.all([
    offsetOverview(),
    prisma.complianceLine.count({ where: { isCompliant: false, OR: [{ review: null }, { review: { disposition: "PENDING" } }] } }),
    prisma.complianceReport.count({ where: { status: { not: "PUBLISHED" } } }),
    recentPublishedReports(),
    prisma.scorecard.findFirst({
      where: { publishedAt: { not: null }, report: { status: "PUBLISHED" } },
      orderBy: [{ report: { period: { fiscalMonth: "desc" } } }, { publishedAt: "desc" }],
    }),
  ]);
  const published = latestScorecard ? scorecardData(latestScorecard.data) : null;
  const { lastMonth } = overview;
  // Report pages for people who work on reports; the published scorecard for everyone else
  const reportHref = (id: string) => (user.permissions.has("reports.view") ? `/reports/${id}` : `/scorecards/${id}`);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          THD compliance offsets and open work{lastMonth ? `, latest data ${fiscalLabel(lastMonth)}` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={DollarSign} label="12-month pre-dispute offsets" value={formatCurrency(overview.twelveMonthTotal)} />
        <StatCard icon={FileSpreadsheet} label={lastMonth ? `Violations in ${fiscalLabel(lastMonth)}` : "Violations"} value={overview.lastMonthViolations} tone="red" />
        <StatCard icon={AlertTriangle} label="Violations not yet reviewed (all periods)" value={pendingReview} tone="amber" />
        <StatCard icon={ClipboardCheck} label="Reports in progress" value={openReports} tone="green" />
      </div>

      {published && latestScorecard && (
        <Link href={`/scorecards/${latestScorecard.reportId}`} className="block">
          <LatestScorecardCard data={published} />
        </Link>
      )}

      <RollingOffsetsCard overview={overview} />
      <OffsetsByProgramCard overview={overview} />
      <RecentReportsCard reports={recent.map((r) => ({ ...r, href: reportHref(r.id) }))} />
    </div>
  );
}
