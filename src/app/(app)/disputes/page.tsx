import Link from "next/link";
import { Ban, CheckCircle2, Clock, Gavel } from "lucide-react";
import type { DisputeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";
import { cn, formatCurrency, formatUtcDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { DisputeStatusBadge } from "@/components/shared/status-badges";

const FILTERS: { key: string; label: string; statuses: DisputeStatus[] }[] = [
  { key: "open", label: "To submit", statuses: ["PREPARING", "READY"] },
  { key: "submitted", label: "Awaiting decision", statuses: ["SUBMITTED"] },
  { key: "decided", label: "Decided", statuses: ["APPROVED", "PARTIAL", "DENIED"] },
  { key: "all", label: "All", statuses: ["PREPARING", "READY", "SUBMITTED", "APPROVED", "PARTIAL", "DENIED", "WITHDRAWN"] },
];

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePagePermission("reports.view");
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];

  const [disputes, totals, reports] = await Promise.all([
    prisma.dispute.findMany({
      where: { status: { in: filter.statuses } },
      include: { line: { include: { metric: { include: { program: true } } } }, reasonCode: { select: { code: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 500,
    }),
    prisma.dispute.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountDisputed: true, amountRecovered: true } }),
    prisma.complianceReport.findMany({ include: { period: true, programs: true } }),
  ]);

  // A dispute belongs to the report covering its line's period and program
  const reportFor = (fiscalMonth: number, programId: string) =>
    reports.find((r) => r.period.fiscalMonth === fiscalMonth && r.programs.some((p) => p.programId === programId));
  const sum = (statuses: DisputeStatus[], field: "amountDisputed" | "amountRecovered") =>
    totals.filter((t) => statuses.includes(t.status)).reduce((s, t) => s + Number(t._sum[field] ?? 0), 0);
  const count = (statuses: DisputeStatus[]) => totals.filter((t) => statuses.includes(t.status)).reduce((s, t) => s + t._count._all, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
        <p className="text-sm text-gray-500 mt-1">Every compliance dispute across reports, soonest deadline first.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="To submit" value={`${count(["PREPARING", "READY"])} · ${formatCurrency(sum(["PREPARING", "READY"], "amountDisputed"))}`} tone="amber" />
        <StatCard icon={Gavel} label="Awaiting THD decision" value={`${count(["SUBMITTED"])} · ${formatCurrency(sum(["SUBMITTED"], "amountDisputed"))}`} />
        <StatCard icon={CheckCircle2} label="Recovered" value={formatCurrency(sum(["APPROVED", "PARTIAL"], "amountRecovered"))} tone="green" />
        <StatCard icon={Ban} label="Denied" value={`${count(["DENIED"])} · ${formatCurrency(sum(["DENIED"], "amountDisputed"))}`} tone="red" />
      </div>

      <div className="inline-flex h-9 items-center rounded-lg bg-gray-100 p-1 text-gray-500">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/disputes?show=${f.key}`} className={cn("rounded-md px-3 py-1 text-sm font-medium", f.key === filter.key && "bg-white text-gray-900 shadow")}>
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["PO", "Program · Metric", "Period", "Reason code", "Amount", "Due", "Status"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {disputes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-gray-400">No {filter.label.toLowerCase()} disputes.</td>
              </tr>
            )}
            {disputes.map((d) => {
              const report = reportFor(d.line.fiscalMonth, d.line.metric.programId);
              const overdue = d.dueDate && ["PREPARING", "READY"].includes(d.status) && d.dueDate < new Date();
              return (
                <tr key={d.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {report ? (
                      <Link href={`/reports/${report.id}/disputes?d=${d.id}`} className="font-medium text-blue-600 hover:underline">{d.line.poNumber ?? "—"}</Link>
                    ) : (
                      <span className="font-medium text-gray-900">{d.line.poNumber ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{d.line.metric.program.name}<div className="text-xs text-gray-500">{d.line.metric.name}</div></td>
                  <td className="px-4 py-3 text-gray-700">FM {d.line.fiscalMonth}</td>
                  <td className="px-4 py-3 text-gray-700">{d.reasonCode?.code ?? <span className="text-gray-400">Not chosen</span>}</td>
                  <td className="px-4 py-3 text-gray-900">
                    {formatCurrency(Number(d.amountDisputed))}
                    {d.amountRecovered != null && <div className="text-xs text-green-700">{formatCurrency(Number(d.amountRecovered))} recovered</div>}
                  </td>
                  <td className={cn("px-4 py-3 whitespace-nowrap", overdue ? "text-red-700 font-medium" : "text-gray-700")}>{formatUtcDate(d.dueDate)}</td>
                  <td className="px-4 py-3">
                    <DisputeStatusBadge status={d.status} />
                    {d.spmDecisionSeen && <div className="text-xs text-amber-700">SPM: {d.spmDecisionSeen}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-400">Statuses: {Object.values(DISPUTE_STATUS_LABELS).join(" · ")}</p>
    </div>
  );
}
