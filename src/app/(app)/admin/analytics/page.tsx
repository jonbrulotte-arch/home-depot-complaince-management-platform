import Link from "next/link";
import { requirePagePermission } from "@/lib/auth-guard";
import { ANALYTICS_RANGES, analyticsOverview, parseRange } from "@/lib/view-analytics";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RangeSelect } from "@/components/analytics/range-select";
import { StatTiles } from "@/components/analytics/stat-tiles";

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm";
const n = (v: number) => v.toLocaleString("en-US");

export default async function ViewAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePagePermission("admin.analytics");
  const days = parseRange((await searchParams).days);
  const { rows, totals } = await analyticsOverview(days);
  const rangeLabel = ANALYTICS_RANGES.find((r) => r.days === days)!.label.toLowerCase();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">View Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Who opens and downloads the published scorecards, in the app and through their public links. A session is one browser&apos;s visit; it ends after
            30 minutes without activity.
          </p>
        </div>
        <RangeSelect days={days} />
      </div>

      <StatTiles
        stats={[
          { label: "Hits", value: n(totals.hits), hint: rangeLabel },
          { label: "Views", value: n(totals.views) },
          { label: "Downloads", value: n(totals.downloads), hint: "PDF and Excel" },
          { label: "Unique sessions", value: n(totals.sessions) },
          { label: "Signed-in users", value: n(totals.users) },
          { label: "Public-link hits", value: n(totals.publicHits) },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Scorecards</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-400">No scorecards have been published yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["Scorecard", "Published", "Hits", "Views", "Downloads", "Unique sessions", "Signed-in users", "Public-link hits", "Last hit"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.reportId} className="border-t border-gray-200">
                      <td className={cn(td, "text-gray-900")}>
                        <Link href={`/admin/analytics/${r.reportId}?days=${days}`} className="font-medium text-blue-600 hover:underline">
                          {r.month}
                        </Link>
                        <div className="text-xs text-gray-500">{r.title}</div>
                      </td>
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>
                        {formatDate(r.publishedAt)}
                        <div className="text-xs text-gray-500">version {r.version}</div>
                      </td>
                      <td className={cn(td, "font-medium text-gray-900")}>{n(r.hits)}</td>
                      <td className={cn(td, "text-gray-700")}>{n(r.views)}</td>
                      <td className={cn(td, "text-gray-700")}>{n(r.downloads)}</td>
                      <td className={cn(td, "text-gray-700")}>{n(r.sessions)}</td>
                      <td className={cn(td, "text-gray-700")}>{n(r.users)}</td>
                      <td className={cn(td, "text-gray-700")}>{n(r.publicHits)}</td>
                      <td className={cn(td, r.lastAt ? "text-gray-700" : "text-gray-400", "whitespace-nowrap")}>{r.lastAt ? formatDateTime(r.lastAt) : "No hits"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
