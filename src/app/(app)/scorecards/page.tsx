import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { scorecardData } from "@/lib/scorecard-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default async function ScorecardsPage() {
  await requirePagePermission("view.dashboard");
  const scorecards = await prisma.scorecard.findMany({
    where: { publishedAt: { not: null } },
    include: { report: { include: { period: true } } },
    orderBy: { report: { period: { fiscalMonth: "desc" } } },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scorecards</h1>
        <p className="text-sm text-gray-500 mt-1">Published monthly THD compliance scorecards.</p>
      </div>
      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Period", "Violations", "Pre-dispute", "Recovered", "Post-dispute", "Published"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scorecards.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-sm text-gray-400">No scorecards have been published yet.</td>
              </tr>
            )}
            {scorecards.map((s) => {
              const d = scorecardData(s.data);
              return (
                <tr key={s.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/scorecards/${s.reportId}`} className="font-medium text-blue-600 hover:underline">{d.periodLabel}</Link>
                    <div className="text-xs text-gray-500">FM {d.fiscalMonth}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{d.totals.violations}</td>
                  <td className="px-4 py-3 text-gray-700">{formatCurrency(d.totals.preOffset)}</td>
                  <td className="px-4 py-3 text-green-700">{formatCurrency(d.totals.recovered)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(d.totals.postOffset)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(s.publishedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
