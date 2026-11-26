import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { normalizePackageId } from "@/lib/package-id";
import { packageReport } from "@/lib/packages";
import { cn, formatCurrency, formatUtcDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm";

export default async function PackagePage({ params }: { params: Promise<{ packageId: string }> }) {
  const user = await requirePagePermission("view.polookup");
  const id = normalizePackageId((await params).packageId);
  const pkg = id ? await packageReport(id) : null;
  if (!pkg) notFound();
  const canSeeReports = user.permissions.has("reports.view");
  const stats: [string, string, string?][] = [
    ["POs", String(pkg.totals.pos)],
    ["Chargeback lines", String(pkg.totals.lines)],
    ["Offsets", formatCurrency(pkg.totals.offset)],
    ["Recovered in disputes", formatCurrency(pkg.totals.recovered), "text-green-700"],
    ["Net chargebacks", formatCurrency(pkg.totals.net), pkg.totals.net > 0 ? "text-red-700" : undefined],
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/po-lookup?q=${encodeURIComponent(pkg.packageId)}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> PO Lookup
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Package {pkg.packageId}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Chargebacks from{" "}
            {pkg.slots.map((s, i) => (
              <span key={`${s.reportId}-${s.program}-${s.compliancePeriod}`}>
                {i > 0 && "; "}
                {canSeeReports ? (
                  <Link href={`/reports/${s.reportId}`} className="text-blue-600 hover:underline">
                    {s.report}
                  </Link>
                ) : (
                  s.report
                )}{" "}
                ({s.program}, {s.compliancePeriod})
              </span>
            ))}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/po-lookup/package/${encodeURIComponent(pkg.packageId)}/export`}>
            <Download className="h-4 w-4 mr-1.5" />
            Export to Excel
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
          <CardTitle>POs and chargebacks</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pkg.lines.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-gray-400">No lines with an offset in this package&apos;s reports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {["PO #", "Program · Metric", "Report", "SKU", "Site", "Offset", "Decision", "Team", "Dispute", "Recovered", "Net"].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pkg.lines.map((l) => (
                    <tr key={l.lineId} className="border-t border-gray-200 align-top">
                      <td className={cn(td, "text-gray-900")}>
                        {l.poRecordId ? (
                          <Link href={`/po/${l.poRecordId}`} className="text-blue-600 hover:underline">
                            {l.poNumber ?? "—"}
                          </Link>
                        ) : (
                          (l.poNumber ?? "—")
                        )}
                        {l.poCreateDate && <div className="text-xs text-gray-500">Created {formatUtcDate(l.poCreateDate)}</div>}
                      </td>
                      <td className={cn(td, "text-gray-900")}>
                        {l.program}
                        <div className="text-xs text-gray-500">{l.metric}</div>
                      </td>
                      <td className={cn(td, "text-gray-700")}>
                        {l.reportPeriod}
                        <div className="text-xs text-gray-500">{l.compliancePeriod}</div>
                      </td>
                      <td className={cn(td, "text-gray-700")}>
                        {l.sku ?? "—"}
                        {l.description && <div className="max-w-56 truncate text-xs text-gray-500" title={l.description}>{l.description}</div>}
                      </td>
                      <td className={cn(td, "text-gray-700")}>{l.site ?? "—"}</td>
                      <td className={cn(td, "text-gray-900")}>{formatCurrency(l.offset)}</td>
                      <td className={cn(td, "text-gray-700")}>{l.decision}</td>
                      <td className={cn(td, "text-gray-700")}>{l.team ?? "—"}</td>
                      <td className={cn(td, l.disputeStatus ? "text-gray-700" : "text-gray-400")}>{l.disputeStatus ?? "Not disputed"}</td>
                      <td className={cn(td, l.recovered ? "text-green-700" : "text-gray-400")}>{l.recovered ? formatCurrency(l.recovered) : "—"}</td>
                      <td className={cn(td, "font-medium text-gray-900")}>{formatCurrency(l.net)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                    <td className={cn(td, "text-gray-900")} colSpan={5}>
                      Total
                    </td>
                    <td className={cn(td, "text-gray-900")}>{formatCurrency(pkg.totals.offset)}</td>
                    <td colSpan={3} />
                    <td className={cn(td, "text-green-700")}>{formatCurrency(pkg.totals.recovered)}</td>
                    <td className={cn(td, "text-gray-900")}>{formatCurrency(pkg.totals.net)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
