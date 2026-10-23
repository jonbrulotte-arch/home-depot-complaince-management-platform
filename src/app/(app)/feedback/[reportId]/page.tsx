import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { scorecardFeedback } from "@/lib/feedback";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FeedbackWorkspace } from "./feedback-workspace";

export default async function ScorecardFeedbackPage({ params }: { params: Promise<{ reportId: string }> }) {
  const user = await requirePagePermission("feedback.view");
  const { reportId } = await params;
  const found = await scorecardFeedback(reportId);
  if (!found) notFound();
  const { data } = found;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/feedback" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> Scorecard Feedback
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{data.periodLabel} scorecard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Published {formatDate(found.publishedAt)} · {found.violations.length} violation(s) · {formatCurrency(data.totals.postOffset)} post-dispute offsets
          </p>
        </div>
        {user.permissions.has("view.dashboard") && (
          <Link href={`/scorecards/${reportId}`} className="text-sm text-blue-600 hover:underline">
            Full scorecard
          </Link>
        )}
      </div>
      {found.missingLineIds > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {found.missingLineIds} violation(s) on this scorecard were published before feedback existed and can&apos;t take feedback until the scorecard is regenerated and republished.
        </p>
      )}
      <FeedbackWorkspace
        reportId={reportId}
        violations={found.violations}
        initialFeedback={found.feedback}
        currentUserId={user.id}
        canSubmit={user.permissions.has("feedback.submit")}
        canDeleteAny={user.permissions.has("admin.users")}
        canOpenPo={user.permissions.has("view.polookup")}
      />
    </div>
  );
}
