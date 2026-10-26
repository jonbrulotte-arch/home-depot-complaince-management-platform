import Link from "next/link";
import { requirePagePermission } from "@/lib/auth-guard";
import { feedbackScorecards } from "@/lib/feedback";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default async function FeedbackPage() {
  await requirePagePermission("feedback.view");
  const scorecards = await feedbackScorecards();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Scorecard Feedback</h1>
        <p className="text-sm text-gray-500 mt-1">Review the violations on each published scorecard and add context the compliance team should know.</p>
      </div>
      <Card className="overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Period", "Violations", "With feedback", "Comments", "Published"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scorecards.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-gray-400">No published scorecards with violations yet.</td>
              </tr>
            )}
            {scorecards.map((s) => (
              <tr key={s.reportId} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/feedback/${s.reportId}`} className="font-medium text-blue-600 hover:underline">{s.periodLabel}</Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{s.violations}</td>
                <td className="px-4 py-3 text-gray-700">
                  {s.violationsWithFeedback} of {s.violations}
                </td>
                <td className="px-4 py-3 text-gray-700">{s.feedback || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(s.publishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
