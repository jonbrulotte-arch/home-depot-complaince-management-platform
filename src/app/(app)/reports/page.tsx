import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { calendarToFiscal, fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ReportStatusBadge } from "@/components/shared/status-badges";
import { NewReportDialog } from "./new-report-dialog";

export default async function ReportsPage() {
  const user = await requirePagePermission("reports.view");
  const [reports, programs] = await Promise.all([
    prisma.complianceReport.findMany({
      orderBy: [{ period: { fiscalMonth: "desc" } }, { createdAt: "desc" }],
      include: { period: true, createdBy: { select: { name: true } }, programs: { include: { program: { select: { name: true } } } } },
    }),
    prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  // SPM data for a month is available the following month, so default to last month
  const now = new Date();
  const current = calendarToFiscal(now.getFullYear(), now.getMonth());
  const periods = Array.from({ length: 24 }, (_, i) => shiftFiscalMonth(current, -i)).map((fm) => ({ fiscalMonth: fm, label: `${fiscalLabel(fm)} (FM ${fm})` }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Monthly compliance analysis: import SPM data, review each violation, then prepare disputes.</p>
        </div>
        {user.permissions.has("reports.create") && (
          <NewReportDialog periods={periods} defaultFiscalMonth={shiftFiscalMonth(current, -1)} programs={programs} />
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Report", "Fiscal month", "Programs", "Status", "Created"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-gray-400">No reports yet. Create one to import this month&apos;s SPM data.</td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/reports/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.title}</Link>
                </td>
                <td className="px-4 py-3 text-gray-700">FM {r.period.fiscalMonth}</td>
                <td className="px-4 py-3 text-gray-700">{r.programs.map((p) => p.program.name).join(", ")}</td>
                <td className="px-4 py-3"><ReportStatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt)}{r.createdBy ? ` · ${r.createdBy.name}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
