import Link from "next/link";
import { notFound } from "next/navigation";
import { Gavel, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { getMetricStats } from "@/lib/reports";
import { cn, formatCurrency, formatDateTime, formatPct } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgramStatusBadge, ReportStatusBadge } from "@/components/shared/status-badges";
import { ImportPanel } from "./import-panel";
import { ReportActions } from "./report-actions";

const STEPS = [
  { status: "DRAFT", label: "Import data" },
  { status: "IN_REVIEW", label: "Review violations" },
  { status: "DISPUTES", label: "Disputes" },
  { status: "SCORECARD", label: "Scorecard" },
  { status: "PUBLISHED", label: "Published" },
] as const;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("reports.view");
  const { id } = await params;
  const report = await prisma.complianceReport.findUnique({
    where: { id },
    include: {
      period: true,
      programs: {
        include: {
          program: true,
          batches: { orderBy: { importedAt: "desc" }, include: { importedBy: { select: { name: true } } } },
        },
        orderBy: { program: { sortOrder: "asc" } },
      },
    },
  });
  if (!report) notFound();

  const fiscalMonth = report.period.fiscalMonth;
  const stats = await getMetricStats(report.programs.map((p) => p.programId), fiscalMonth);
  const totalNc = stats.reduce((s, m) => s + m.nonCompliant, 0);
  const totalReviewed = stats.reduce((s, m) => s + m.reviewed, 0);
  const totalOffset = stats.reduce((s, m) => s + m.offset, 0);
  const totalPostDispute = stats.reduce((s, m) => s + m.postDisputeOffset, 0);
  const totalRecovered = stats.reduce((s, m) => s + m.recovered, 0);
  const disputeStage = report.status !== "DRAFT" && report.status !== "IN_REVIEW";
  const stepIndex = STEPS.findIndex((s) => s.status === report.status);
  const canImport = user.permissions.has("reports.import") && (report.status === "DRAFT" || report.status === "IN_REVIEW");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
            <ReportStatusBadge status={report.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            THD fiscal month {fiscalMonth} · {totalNc} non-compliant line(s) · {formatCurrency(totalOffset)} pre-dispute offsets
            {disputeStage && <> · {formatCurrency(totalRecovered)} recovered · {formatCurrency(totalPostDispute)} post-dispute</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalNc > 0 && (
            <Button asChild variant="outline">
              <Link href={`/reports/${id}/analysis`}>
                <ListChecks className="h-4 w-4 mr-1.5" />
                Review lines ({totalReviewed}/{totalNc})
              </Link>
            </Button>
          )}
          {disputeStage && (
            <Button asChild variant="outline">
              <Link href={`/reports/${id}/disputes`}>
                <Gavel className="h-4 w-4 mr-1.5" />
                Disputes
              </Link>
            </Button>
          )}
          {user.permissions.has("reports.advance") && <ReportActions reportId={id} status={report.status} pending={totalNc - totalReviewed} />}
        </div>
      </div>

      <ol className="grid grid-cols-5 gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s.status}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium",
              i < stepIndex && "border-green-200 bg-green-50 text-green-800",
              i === stepIndex && "border-blue-200 bg-blue-50 text-blue-700",
              i > stepIndex && "border-gray-200 bg-white text-gray-400",
            )}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {report.notes && <p className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{report.notes}</p>}

      {report.programs.map((rp) => {
        const programStats = stats.filter((s) => s.programId === rp.programId);
        return (
          <Card key={rp.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <CardTitle>{rp.program.name}</CardTitle>
                <ProgramStatusBadge status={rp.status} />
              </div>
              {canImport && <ImportPanel reportId={id} programId={rp.programId} programName={rp.program.name} />}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Metric", "Lines", "Non-compliant", "Reviewed", "Compliance", "Goal", "Pre-dispute offset", ...(disputeStage ? ["Disputed", "Post-dispute"] : [])].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {programStats.map((m) => (
                      <tr key={m.metricId} className="border-t border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">{m.name}</td>
                        <td className="px-4 py-3 text-gray-700">{m.total}</td>
                        <td className="px-4 py-3">{m.nonCompliant ? <span className="font-medium text-red-700">{m.nonCompliant}</span> : <span className="text-gray-400">0</span>}</td>
                        <td className="px-4 py-3 text-gray-700">{m.nonCompliant ? `${m.reviewed}/${m.nonCompliant}` : "—"}</td>
                        <td className="px-4 py-3">
                          {m.compliancePct == null ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <Badge variant={m.meetsThreshold ? "success" : "destructive"}>{formatPct(m.compliancePct, 2)}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{m.thresholdPct == null ? "—" : `≥ ${m.thresholdPct}%`}</td>
                        <td className="px-4 py-3 text-gray-900">{m.offset ? formatCurrency(m.offset) : "—"}</td>
                        {disputeStage && (
                          <>
                            <td className="px-4 py-3 text-gray-700">{m.disputed ? `${m.disputed} (${m.approved} approved)` : "—"}</td>
                            <td className="px-4 py-3">
                              {m.offset ? <span className={m.postDisputeOffset < m.offset ? "font-medium text-green-700" : "text-gray-900"}>{formatCurrency(m.postDisputeOffset)}</span> : "—"}
                              {m.postDisputePct != null && m.postDisputePct !== m.compliancePct && <div className="text-xs text-gray-500">{formatPct(m.postDisputePct, 2)}</div>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rp.batches.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Imports</p>
                  <ul className="space-y-1">
                    {rp.batches.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <Badge variant="outline">{b.exportKind.replace("_", " ")}</Badge>
                        <span className="text-gray-700">{b.fileName}</span>
                        <span>· {b.rowCount} rows ({b.createdCount} new, {b.updatedCount} updated)</span>
                        <span>· {formatDateTime(b.importedAt)}{b.importedBy ? ` by ${b.importedBy.name}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rp.batches.length === 0 && programStats.every((m) => m.total === 0) && (
                <p className="text-sm text-gray-400">
                  No data yet. Download the {rp.program.name} export for FM {fiscalMonth} from the Supplier Performance Management tool and import it here.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
