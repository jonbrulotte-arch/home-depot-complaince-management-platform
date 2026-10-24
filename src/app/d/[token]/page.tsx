import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DollarSign, FileSpreadsheet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { fiscalLabel } from "@/lib/fiscal";
import { formatCurrency } from "@/lib/utils";
import { offsetOverview, recentPublishedReports } from "@/lib/dashboard";
import { scorecardData } from "@/lib/scorecard-store";
import { ensureShareToken } from "@/lib/scorecard-share";
import { BrandMark } from "@/components/layout/brand-mark";
import { StatCard } from "@/components/shared/stat-card";
import { LatestScorecardCard, OffsetsByProgramCard, RecentReportsCard, RollingOffsetsCard } from "@/components/dashboard/dashboard-sections";

// Public, read-only dashboard: anyone with the link sees the offset figures and the published
// scorecards (through their public links). Admins turn it on, off or reset its link in Settings.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const PUBLISHED_SHOWN = 24;

export default async function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const settings = await prisma.siteSettings.findUnique({ where: { publicDashboardToken: token }, select: { id: true } });
  if (!settings) notFound();

  const [branding, overview, published] = await Promise.all([getBranding(), offsetOverview(), recentPublishedReports(PUBLISHED_SHOWN)]);
  // Every scorecard listed gets its public link
  const linked = await Promise.all(published.map(async (r) => ({ ...r, href: await ensureShareToken(r.id).then((t) => (t ? `/s/${t}` : null)) })));
  const latest = linked[0];
  const latestScorecard = latest ? await prisma.scorecard.findUnique({ where: { reportId: latest.id }, select: { data: true } }) : null;
  const { lastMonth } = overview;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900">
        <div className="max-w-7xl mx-auto flex items-center px-6 py-3">
          <BrandMark branding={branding} />
        </div>
      </header>
      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">THD compliance dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Offsets from The Home Depot&apos;s compliance programs{lastMonth ? `, latest data ${fiscalLabel(lastMonth)}` : ""}.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard icon={DollarSign} label="12-month pre-dispute offsets" value={formatCurrency(overview.twelveMonthTotal)} />
          <StatCard icon={FileSpreadsheet} label={lastMonth ? `Violations in ${fiscalLabel(lastMonth)}` : "Violations"} value={overview.lastMonthViolations} tone="red" />
        </div>

        {latest && latestScorecard && (
          latest.href ? (
            <Link href={latest.href} className="block">
              <LatestScorecardCard data={scorecardData(latestScorecard.data)} />
            </Link>
          ) : (
            <LatestScorecardCard data={scorecardData(latestScorecard.data)} />
          )
        )}

        <RollingOffsetsCard overview={overview} />
        <OffsetsByProgramCard overview={overview} />
        <RecentReportsCard reports={linked} title="Published scorecards" />
      </main>
    </div>
  );
}
