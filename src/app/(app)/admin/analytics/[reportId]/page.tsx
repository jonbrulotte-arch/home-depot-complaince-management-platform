import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { ANALYTICS_RANGES, browserLabel, parseRange, scorecardAnalytics } from "@/lib/view-analytics";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RangeSelect } from "@/components/analytics/range-select";
import { StatTiles } from "@/components/analytics/stat-tiles";
import { HitsChart } from "@/components/analytics/hits-chart";

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm";
const n = (v: number) => v.toLocaleString("en-US");
const KIND = { VIEW: "View", PDF: "PDF download", EXCEL: "Excel download" } as const;

export default async function ScorecardAnalyticsPage({ params, searchParams }: { params: Promise<{ reportId: string }>; searchParams: Promise<{ days?: string }> }) {
  await requirePagePermission("admin.analytics");
  const days = parseRange((await searchParams).days);
  const a = await scorecardAnalytics((await params).reportId, days);
  if (!a) notFound();
  const rangeLabel = ANALYTICS_RANGES.find((r) => r.days === days)!.label.toLowerCase();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/admin/analytics?days=${days}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> View Analytics
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{a.month} scorecard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {a.title} · published {formatDate(a.publishedAt)} · version {a.version}
            {!a.stillPublished && " · the report is no longer published"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/scorecards/${a.reportId}`}>
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Open scorecard
            </Link>
          </Button>
          <RangeSelect days={days} />
        </div>
      </div>

      <StatTiles
        stats={[
          { label: "Hits", value: n(a.totals.hits), hint: rangeLabel },
          { label: "Views", value: n(a.totals.views) },
          { label: "Downloads", value: n(a.totals.downloads), hint: "PDF and Excel" },
          { label: "Unique sessions", value: n(a.totals.sessions) },
          { label: "Signed-in users", value: n(a.totals.users) },
          { label: "Public-link hits", value: n(a.totals.publicHits) },
        ]}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Hits per day</CardTitle>
        </CardHeader>
        <CardContent>
          <HitsChart points={a.daily} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Signed-in users who opened this scorecard</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {a.viewers.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-400">No signed-in user has opened it in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["User", "Role", "Views", "Downloads", "First", "Last"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.viewers.map((v) => (
                    <tr key={v.userId} className="border-t border-gray-200">
                      <td className={cn(td, "text-gray-900")}>
                        {v.name}
                        {!v.active && (
                          <Badge variant="secondary" className="ml-2">
                            Inactive
                          </Badge>
                        )}
                        <div className="text-xs text-gray-500">{v.email}</div>
                      </td>
                      <td className={cn(td, "text-gray-700")}>{v.role}</td>
                      <td className={cn(td, "text-gray-700")}>
                        {n(v.views)}
                        {v.publicLink && <div className="text-xs text-gray-500">incl. the public link</div>}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{n(v.downloads)}</td>
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>{formatDateTime(v.firstAt)}</td>
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>{formatDateTime(v.lastAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle>Latest hits</CardTitle>
          <p className="text-sm text-gray-500">The 100 most recent in this period. Visitors who weren&apos;t signed in show as Anonymous.</p>
        </CardHeader>
        <CardContent className="p-0">
          {a.recent.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-400">No hits in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["When", "Who", "What", "Where", "Session", "Browser", "IP address"].map((h) => (
                      <th key={h} className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.recent.map((h) => (
                    <tr key={h.id} className="border-t border-gray-200">
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>{formatDateTime(h.at)}</td>
                      <td className={cn(td, h.user ? "text-gray-900" : "text-gray-500")}>{h.user?.name ?? "Anonymous"}</td>
                      <td className={td}>
                        <Badge variant={h.kind === "VIEW" ? "secondary" : "default"}>{KIND[h.kind]}</Badge>
                        {h.version !== a.version && <div className="text-xs text-gray-500">version {h.version}</div>}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{h.channel === "PUBLIC" ? "Public link" : "App"}</td>
                      <td className={cn(td, "font-mono text-xs text-gray-500")}>{h.sessionId.slice(0, 8)}</td>
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")} title={h.userAgent ?? undefined}>
                        {browserLabel(h.userAgent)}
                      </td>
                      <td className={cn(td, "text-gray-500")}>{h.ip ?? "—"}</td>
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
